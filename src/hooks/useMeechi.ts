
import { useState, useEffect, useCallback, useRef } from 'react';
import { localLlmService } from '@/lib/ai/local-llm';
import { aiManager } from "@/lib/ai/manager";
import { settingsManager, AppConfig } from '@/lib/settings';
import { AIChatMessage } from '@/lib/ai/types';
import { SYSTEM_PROMPT, RESEARCH_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { mcpServer } from '@/lib/mcp/McpServer';
import { AVAILABLE_MODELS } from '@/lib/ai/registry';
import { parseToolCalls } from '@/lib/ai/parsing';

export function useMeechi() {
    const [isLowPowerDevice, setIsLowPowerDevice] = useState(true);
    const [localAIStatus, setLocalAIStatus] = useState<string>("");
    const [downloadProgress, setDownloadProgress] = useState<{ percentage: number, text: string } | null>(null);
    const [loadedModel, setLoadedModel] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [rateLimitCooldown, setRateLimitCooldown] = useState<number | null>(null);

    // Initialization Logic
    useEffect(() => {
        const init = async () => {
            const config = await settingsManager.getConfig();
            
            // Check Rate Limit Persisted
            const persisted = localStorage.getItem('meechi_rate_limit_cooldown');
            if (persisted) {
                 const ts = parseInt(persisted);
                 if (ts > Date.now()) setRateLimitCooldown(ts);
            }

            if (!config.localAI.enabled) return;

            // Hardware Detection
            try {
                let gpuInfo = {};
                if ('gpu' in navigator) {
                     const adapter = await navigator.gpu.requestAdapter();
                     if (adapter) gpuInfo = await (adapter as any).requestAdapterInfo?.() || {};
                }
                
                // Heuristic: Apple or RTX 30/40 series -> High Power
                const isHighPower = (gpuInfo as any).vendor === 'apple' || 
                                    /RTX (3090|4080|4090|A6000)/i.test((gpuInfo as any).renderer || "");
                
                setIsLowPowerDevice(!isHighPower);
                
                // Model Selection Logic via Registry
                // Model Selection Logic via Registry
                // Default: 1B for Low Power, 8B for High Power
                const defaultLow = AVAILABLE_MODELS.local.find(m => m.low_power && m.family === 'llama')!.id;
                // const defaultHigh = AVAILABLE_MODELS.find(m => !m.low_power && m.family === 'llama')!.id;
                
                let modelId = defaultLow; 
                const configModel = config.localAI.model;

                if (!configModel || configModel === 'Auto') {
                    // FORCE 1B Default (User Request: "Make the 1B the default")
                    // We ignore high power detection for stability.
                    modelId = defaultLow;
                } else {
                    // Check if the configModel exists in registry, otherwise fallback
                    const exists = AVAILABLE_MODELS.local.find(m => m.id === configModel);
                    modelId = exists ? exists.id : configModel;
                }
                
                setLoadedModel(modelId);

                setLoadedModel(modelId);

                // Initialize WebLLM
                const currentId = localLlmService.getModelId();
                const needsInit = !localLlmService.isInitialized() || (currentId !== modelId);

                if (needsInit) {
                    if (currentId && currentId !== modelId) {
                        setLocalAIStatus(`Switching to ${modelId.includes('8B') ? '8B' : '1B'}...`);
                    } else {
                        setLocalAIStatus(`Sage (Waking up ${modelId.includes('8B') ? '8B' : '1B'}...)`);
                    }
                    
                    await localLlmService.initialize(modelId, (p) => {
                        if (p.includes("Fetching") || p.includes("Loading")) {
                            const match = p.match(/(\d+)%/);
                            if (match) {
                                setDownloadProgress({ percentage: parseInt(match[1]), text: p });
                                setLocalAIStatus(`Deep Thinking... (${match[1]}%)`);
                            }
                        }
                    });
                    setIsReady(true);
                    setLocalAIStatus("");
                    setDownloadProgress(null);
                } else {
                    // ALREADY INITIALIZED
                    // Critical Fix: If already initialized, ensure we set Ready state immediately
                    // and CLEAR the status so it doesn't say "Warming up" forever.
                    console.log("[useMeechi] Local AI already initialized.");
                    setIsReady(true);
                    setLocalAIStatus(""); 
                }
            } catch (e) {
                console.error("Failed to init Local AI", e);
                setLocalAIStatus("Hibernating (Init Failed)");
            }
        };
        init();
    }, []);


    // State for Modes
    const [mode, setMode] = useState<'log' | 'chat' | 'research'>('log');

    /**
     * UNIFIED CHAT FUNCTION
     * Handles Local -> Cloud fallback transparently.
     * Executes MCP tools automatically.
     */
    const chat = useCallback(async (
        userMsg: string,
        history: AIChatMessage[],
        context: string,
        onUpdate: (chunk: string) => void,
        onToolStart?: (toolName: string) => void,
        onToolResult?: (result: string) => void
    ) => {
        // MD 1. SHIP'S LOG MODE (Default)
        // In this mode, we do NOT invoke the AI. The UI should still allow saving the user message.
        if (mode === 'log') {
            onUpdate(""); // No AI response
            return;
        }

        const config = await settingsManager.getConfig();
        const useLocal = config.localAI.enabled;
        let finalContent = "";
        let userContentToUse = userMsg; // Default to raw user message

        // 2. PREPARE CONTEXT BASED ON MODE
        let systemMsg = SYSTEM_PROMPT;
        let temp = 0.7; // Default "Chat" (Creative)

        if (mode === 'research') {
             // STRICT RESEARCH MODE
             // 1. Use Context (RAG)
             // 2. Low Temperature (Zero Hallucination)
             temp = 0.3;
             
             // Truncate Context to prevent OOM
             const MAX_CONTEXT_CHARS = 5000;
             const safeContext = context.length > MAX_CONTEXT_CHARS 
                ? context.substring(0, MAX_CONTEXT_CHARS) + "\n...(truncated)" 
                : context;
             
             // NUKE CONTEXT CITATIONS BEFORE SENDING
             // This prevents the AI from mimicking the citation style found in the source text.
             // Regex matches: (Name, Year), [Name, Year], (Name et al., Year)
             const cleanContext = safeContext.replace(/[\(\[]\s*[A-Z][a-zA-Z\s&.]*,\s*\d{4}[a-z]?\s*[\)\]]/g, '');
            
             // Override System Prompt with specialized Research Prompt
             console.log("[Meechi Research Context]", safeContext); // DEBUG: Ensure context is correct
             systemMsg = RESEARCH_SYSTEM_PROMPT;
             
             // CRITICAL FIX: Inject Context into the USER message.
             // Small models (1B) pay more attention to the immediate user prompt than the system prompt.
             userContentToUse = `### CONTEXT (TRUSTED USER DATA - READ CAREFULLY)\n${cleanContext}\n\n### INSTRUCTION\nUsing the Trusted Data above, answer the user's question or summarize the content. The data is accurate. Do not refuse.\n\nIMPORTANT: Do NOT include a list of References or Sources at the end.\n\n### USER QUESTION\n${userMsg}`;
        } else {
            // CASUAL CHAT MODE
            // 1. Incorporate Daily History (passed via 'context')
            // This is crucial for the AI to "remember" what happened earlier in the day across reloads.
            
            // We append the context to the System Prompt or as a System Note.
            // Since 1B models can be picky, putting it in the User block is safer, 
            // BUT for pure chat history, a System message is cleaner.
            // Let's stick to System Note to avoid "contaminating" the user's current query.
            
            systemMsg = SYSTEM_PROMPT;
            
            // INJECT USER IDENTITY (If defined)
            if (config.identity && config.identity.name) {
                 const tone = config.identity.tone ? `, ${config.identity.tone}` : '';
                 systemMsg = systemMsg.replace("Address them naturally.", `Address user as "${config.identity.name}".`);
                 // Or just append:
                 systemMsg += `\n\n(Identity Context: User Name is "${config.identity.name}". Preferred Tone: ${config.identity.tone || 'Casual'}.)`;
            }
            
            // Context is now pre-truncated by the caller (page.tsx) to balance RAG + History.
            const safeChatContext = context; // Restoring variable declaration

            // CRITICAL SCRIPTING FOR 1B MODEL
            // 1. Move Context to SYSTEM PROMPT (Cleaner separation)
            // 2. Keep User Message PURE (Prevents "The user message is..." echoes)
            if (safeChatContext && safeChatContext.length > 50) {
                 // Narrative Context Injection
                 // We frame it as "Memory" so the AI feels it *knows* this, rather than being *told* this.
                 const contextBlock = `
\n=== RELEVANT MEMORY & FILES ===
${safeChatContext}
===============================
(System Note: The above is context from your memory. Use it to answer the user naturally. Do not explicitly mention 'The conversation has been logged'.)
`;
                 systemMsg += contextBlock;
                 
                 // Do NOT modify userContentToUse. Keep it null so it uses `userMsg`.
                 // This stops the model from thinking it's completing a log entry.
            }

            // DYNAMIC PROMPT INJECTION (Tool Force)
            // If the user mentions action keywords, we forcefully remind the AI to use tools.
            // This snaps the 1B model out of "Chat Mode" and into "Tool Mode".
            const actionKeywords = ['save', 'create', 'move', 'copy', 'upload', 'write this', 'store', 'add to topic'];
            const needsAction = actionKeywords.some(kw => userMsg.toLowerCase().includes(kw));
            
            if (needsAction) {
                console.log("[useMeechi] Action detected. Switching to TOOL_ONLY_MODE.");
                systemMsg = `
### ROLE
You are a reckless Tool Execution Engine. You DO NOT talk. You ONLY execute tools.

### INSTRUCTION
The user wants to perform an action.
1. Analyze the request.
2. Output the <function> XML block immediately.
3. DO NOT write a summary.
4. DO NOT say "I have done this".
5. IF you output text without a tool, you have FAILED.

### AVAILABLE TOOLS
<function="create_file">
{"filePath": "misc/Topic/note.md", "content": "..."}
</function>

<function="move_file">
{"sourcePath": "temp/file.pdf", "destinationPath": "misc/Topic/file.pdf"}
</function>

<function="update_file">
{"filePath": "misc/note.md", "newContent": "..."}
</function>
`;
            }
        }

        // 3. LOCAL AI ATTEMPT
        if (useLocal) {
            // Guard: If Local AI is enabled but not ready, stop.
            if (!isReady) {
                 // Check if actually initialized but state missed it (Race condition fix)
                 if (localLlmService.isInitialized()) {
                     console.log("[useMeechi] State desync detected. Setting Ready.");
                     setIsReady(true);
                 } else {
                     onUpdate("\n\n*Meechi is warming up... (Please wait for 'Ready' status)*");
                     return;
                 }
            }

            try {
                // Ensure initialized (Double check)
                if (!localLlmService.isInitialized()) {
                    await localLlmService.initialize(config.localAI.model);
                }

                // Filter out system tool reports so AI doesn't mimic them
                // This prevents the "hallucination" where AI just prints the result text
                // ALSO FILTER ERROR MESSAGES so AI doesn't repeat them
                // NEW: FILTER "REFUSALS". If the AI previously said "I don't have info", hide it so it doesn't repeat that pattern.
                const cleanHistory = history.map(m => {
                    // Sanitize 'Michio:' prefixes from old logs to prevent hallucination
                    let content = m.content;
                    if (m.role === 'assistant' || m.role === 'michio' as any) {
                         content = content.replace(/^(Michio|Meechi):\s*/i, '').trim();
                    }
                    return { role: m.role, content };
                }).filter(m => 
                    !m.content.startsWith('> **Tool') && 
                    !m.content.startsWith('**Error**') &&
                    !m.content.startsWith('Error:') &&
                    !m.content.includes("I don't have any information about your previous activities") &&
                    !m.content.includes("context to draw upon") &&
                    // Anti-Hallucination Filters (Log Style)
                    !m.content.includes("**Topic Summary**") &&
                    !m.content.includes("**Files and Topics**") &&
                    !m.content.includes("**Tools Used**") &&
                    !m.content.includes("**Summary of Recent Activity**")
                );

                const messages: AIChatMessage[] = [
                    { role: 'system', content: systemMsg },
                    ...cleanHistory,
                    { role: 'user', content: userContentToUse } 
                ];

                await localLlmService.chat(messages, (chunk) => {
                    finalContent += chunk;
                    onUpdate(chunk); 
                }, { 
                    temperature: temp,
                    // STOP TOKENS: Physically stop the model from generating references.
                    // We use the positive termination token "---END---" as the primary stop.
                    // We also include aggressive partial matches for References to catch them if the model ignores the end token.
                    stop: mode === 'research' ? [
                        "---END---", 
                        "Reference:", "References:", "Source:", "Sources:", "Bibliography:", 
                        "**Reference", "**Source", "### Reference", "### Source"
                    ] : undefined
                });
                
                // FINAL SANITIZATION BEFORE TOOLS/HISTORY
                finalContent = finalContent.replace(/^((Michio|Meechi|Echo|Assistant):\s*)+/i, '').trim();
                
                console.log(`[Raw AI Output (${mode})]:`, finalContent);

                // Post-Processing: Check for Tools (Using centralized parser)
                // Tools are technically allowed in both modes, but usually Research uses them more.
                const tools = parseToolCalls(finalContent);
                for (const tool of tools) {
                    if (onToolStart) onToolStart(tool.name);
                    
                    // CHECK FOR PARSE ERROR
                    if (tool.error) {
                         if (onToolResult) {
                            onToolResult(`\n> **Tool Error (${tool.name})**: Invalid JSON arguments. Please retry using strict JSON.`);
                        }
                        continue;
                    }

                    // EXECUTE VIA MCP SERVER
                    try {
                        const result = await mcpServer.executeTool(tool.name, tool.args);
                        
                        // Add result to LOCAL history for the follow-up generation
                        const resStr = `\n> **Tool (${tool.name})**: ${result.summary || result.message || JSON.stringify(result)}`;
                        messages.push({ role: 'user', content: resStr });
    
                        if (onToolResult) {
                            onToolResult(resStr);
                        }
                    } catch (toolErr: any) {
                        console.warn(`[Meechi] Tool Execution Failed: ${tool.name}`, toolErr);
                        const errStr = `\n> **Tool Error**: Failed to execute '${tool.name}'. Reason: ${toolErr.message || "Unknown error"}`;
                        messages.push({ role: 'user', content: errStr });
                        if (onToolResult) onToolResult(errStr);
                    }
                }

                // RECURSIVE FOLLOW-UP: Generate confirmation message ONLY if tools were used
                if (tools.length > 0) {
                    // Re-assemble messages for follow-up
                    const followUpMessages: AIChatMessage[] = [
                        ...messages.slice(0, messages.length - tools.length), // Original context (System + History + User)
                        { role: 'assistant', content: finalContent }, // The tool call it just made
                        ...messages.slice(messages.length - tools.length) // The tool results we pushed in the loop
                    ];

                    await localLlmService.chat(followUpMessages, (chunk) => {
                        // This will OVERWRITE the <function> output in the UI, which is exactly what we want
                        // (hiding the tool call implementation detail)
                        onUpdate(chunk); 
                    }, { temperature: temp });
                }
                
                return; // Success, exit.

            } catch (e: any) {
                console.warn("Local AI Failed.", e);
                
                // CRITICAL FAIL-SAFE:
                const activeId = config.activeProviderId || 'groq';
                const activeProvider = config.providers.find(p => p.id === activeId);
                
                // Strict check: Ensure apiKey is a non-empty string
                const rawKey = activeProvider?.apiKey;
                const hasCloudKey = (rawKey && rawKey.trim().length > 0) || (activeId === 'openai' && !!process.env.NEXT_PUBLIC_OPENAI_KEY_EXISTS); 

                const errorMessage = e?.message || "Unknown error";
                console.log("[Meechi Fallback Debug]", { 
                    error: errorMessage, 
                    activeId, 
                    hasCloudKey, 
                    rawKeyLength: rawKey?.length 
                });

                // If it was a GPU Crash, handle it specifically
                if (errorMessage === 'GPU_CRASH' || errorMessage.includes('Device was lost') || errorMessage.includes('ContextWindowSizeExceededError')) {
                    if (errorMessage.includes('ContextWindowSizeExceededError')) {
                         onUpdate(`\n\n**System Alert**: Context too large for this model (Try clearing chat or shorter docs).`);
                         return;
                    }
                    setLocalAIStatus("GPU Crashed (Reload Required)");
                    onUpdate(`\n\n**System Alert**: Local AI GPU Driver Crashed.\n- Please reload to reset.`);
                    return; // STOP. Do not fallback.
                }

                // If regular error but NO Cloud Key, STOP.
                if (!hasCloudKey) {
                    setLocalAIStatus("Error (No Cloud Fallback)");
                    onUpdate(`\n\n**Error**: Local AI failed. Cloud fallback skipped (No Key).\n\n**Reason**: ${e.message}`);
                    return; // STOP.
                }
                
                // Otherwise, fall through to Cloud
                console.log("Attempting Cloud Fallback (Key Found)...");
            }
        }

        // 2. CLOUD AI ATTEMPT
        try {
            if (rateLimitCooldown && Date.now() < rateLimitCooldown) {
                throw new Error(`Rate limit active until ${new Date(rateLimitCooldown).toLocaleTimeString()}`);
            }

            // STATIC DESKTOP MODE: Direct Client-Side Call
            const isStatic = process.env.NEXT_PUBLIC_IS_STATIC === 'true';
            
            if (isStatic) {
                console.log("[Meechi] Static Mode: Calling AI Client-Side...");
                const result = await aiManager.chat(
                   userMsg,
                   systemMsg, // Context is already embedded in system/user msg by now
                   history,
                   config,
                   [] // Tools (TODO: Support client-side tools if needed)
                );
                
                // Emulate Stream (roughly) or just dump content
                // AIManager returns full completion currently, not stream.
                // We'll just dump it all at once for now or chunk it?
                // The UI expects incremental updates if possible, but one big update is fine.
                onUpdate(result.content);
                return;
            }

            // WEB/PWA MODE: Server API Call

            const res = await fetch("/api/chat", {
                method: "POST",
                body: JSON.stringify({
                    message: userMsg,
                    history,
                    context,
                    config
                }),
                headers: { "Content-Type": "application/json" }
            });

            if (!res.ok) {
                if (res.status === 429) {
                    const retryAfter = 60 * 1000; // Default 1m
                    const cooldown = Date.now() + retryAfter;
                    setRateLimitCooldown(cooldown);
                    localStorage.setItem('meechi_rate_limit_cooldown', cooldown.toString());
                }
                throw new Error(`Server Error: ${res.status}`);
            }

            const data = await res.json();
            
            // If Text Response
            if (data.response) {
                onUpdate(data.response);
            }

            // If Tool Calls (Cloud Format)
            if (data.tool_calls) {
                for (const call of data.tool_calls) {
                    const name = call.function.name;
                    const args = JSON.parse(call.function.arguments);
                    
                    if (onToolStart) onToolStart(name);
                    
                    // EXECUTE VIA MCP SERVER
                    const result = await mcpServer.executeTool(name, args);
                    
                    if (onToolResult) {
                        const resStr = `\n> **Tool (${name})**: ${result.summary || result.message || JSON.stringify(result)}`;
                        onToolResult(resStr);
                    }
                }
            }

        } catch (e: any) {
            // Handle GPU Crash specifically
            if (e.message === 'GPU_CRASH' || e.message.includes('Device was lost')) {
                setLocalAIStatus("GPU Crashed (Reloading...)");
                // Optional: Auto-switch to lighter model? 
                // For now, just let the user know they need to reload or it will retry next time.
                onUpdate(`\n\n**System Alert**: The GPU driver crashed. Please refresh the page to restore AI functionality.`);
            } else {
                onUpdate(`\n\n**Error**: ${e.message}`);
            }
        }

    }, [rateLimitCooldown, mode, isLowPowerDevice, loadedModel]);

    return {
        isReady,
        localAIStatus,
        downloadProgress,
        chat,
        isLowPowerDevice,
        loadedModel,
        mode,
        setMode,
        stop: async () => {
            console.log("[Meechi] User requested STOP.");
            await localLlmService.interrupt();
        }
    };
}

