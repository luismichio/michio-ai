
import { useState, useEffect, useCallback, useRef } from 'react';
import { localLlmService } from '@/lib/ai/local-llm';
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
            const persisted = localStorage.getItem('michio_rate_limit_cooldown');
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
                const defaultLow = AVAILABLE_MODELS.find(m => m.low_power && m.family === 'llama')!.id;
                // const defaultHigh = AVAILABLE_MODELS.find(m => !m.low_power && m.family === 'llama')!.id;
                
                let modelId = defaultLow; 
                const configModel = config.localAI.model;

                if (!configModel || configModel === 'Auto') {
                    // FORCE 1B Default (User Request: "Make the 1B the default")
                    // We ignore high power detection for stability.
                    modelId = defaultLow;
                } else {
                    // Check if the configModel exists in registry, otherwise fallback
                    const exists = AVAILABLE_MODELS.find(m => m.id === configModel);
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
                    setIsReady(true);
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
            
             // Override System Prompt with specialized Research Prompt
             console.log("[Meechi Research Context]", safeContext); // DEBUG: Ensure context is correct
             systemMsg = RESEARCH_SYSTEM_PROMPT;
             
             // CRITICAL FIX: Inject Context into the USER message.
             // Small models (1B) pay more attention to the immediate user prompt than the system prompt.
             userContentToUse = `### RETRIEVED SOURCES\n${safeContext}\n\n### USER QUESTION\n${userMsg}`;
        } else {
            // CASUAL CHAT MODE
            // 1. IGNORE RAG Context (unless explicitly asked? For now, pure chat as requested)
            // 2. High Temperature (Creative)
            systemMsg = SYSTEM_PROMPT; 
        }

        // 3. LOCAL AI ATTEMPT
        if (useLocal) {
            // Guard: If Local AI is enabled but not ready, stop.
            if (!isReady) {
                 onUpdate("\n\n*Meechi is warming up... (Please wait for 'Ready' status)*");
                 return;
            }

            try {
                // Ensure initialized (Double check)
                if (!localLlmService.isInitialized()) {
                    await localLlmService.initialize(config.localAI.model);
                }

                // Filter out system tool reports so AI doesn't mimic them
                // This prevents the "hallucination" where AI just prints the result text
                // ALSO FILTER ERROR MESSAGES so AI doesn't repeat them
                const cleanHistory = history.filter(m => 
                    !m.content.startsWith('> **Tool') && 
                    !m.content.startsWith('**Error**') &&
                    !m.content.startsWith('Error:')
                );

                const messages: AIChatMessage[] = [
                    { role: 'system', content: systemMsg },
                    ...cleanHistory,
                    { role: 'user', content: userContentToUse } 
                ];

                await localLlmService.chat(messages, (chunk) => {
                    finalContent += chunk;
                    onUpdate(chunk); 
                }, { temperature: temp });
                
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
                    const result = await mcpServer.executeTool(tool.name, tool.args);
                    
                    // Add result to LOCAL history for the follow-up generation
                    const resStr = `\n> **Tool (${tool.name})**: ${result.summary || result.message || JSON.stringify(result)}`;
                    messages.push({ role: 'user', content: resStr });

                    if (onToolResult) {
                        onToolResult(resStr);
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

                console.log("[Meechi Fallback Debug]", { 
                    error: e.message, 
                    activeId, 
                    hasCloudKey, 
                    rawKeyLength: rawKey?.length 
                });

                // If it was a GPU Crash, handle it specifically
                if (e.message === 'GPU_CRASH' || e.message.includes('Device was lost')) {
                    setLocalAIStatus("GPU Crashed (Reload Required)");
                    onUpdate(`\n\n**System Alert**: Local AI GPU Driver Crashed.\n- Please reload or check Settings to ensure '1B' model is selected.`);
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
                    localStorage.setItem('michio_rate_limit_cooldown', cooldown.toString());
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
        setMode
    };
}

