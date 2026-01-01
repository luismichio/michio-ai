
import { useState, useEffect, useCallback, useRef } from 'react';
import { localLlmService } from '@/lib/ai/local-llm';
import { settingsManager, AppConfig } from '@/lib/settings';
import { AIChatMessage } from '@/lib/ai/types';
import { SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { mcpServer } from '@/lib/mcp/McpServer';

// Constants for Models
const MODEL_LOW_POWER = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
const MODEL_STANDARD = 'Llama-3.1-8B-Instruct-q4f32_1-MLC';

// Helper to parse tool calls from text (Local 1B/8B format)
function parseLocalToolCalls(content: string) {
    const tools = [];
    
    // Regex for <function="name">{args}</function> or <function name='name'>{args}</function>
    const toolRegex = /<function(?:=\s*["']?([^"'>]+)["']?|\s+name=["']?([^"'>]+)["']?)\s*>([\s\S]*?)<\/function>/g;
    let match;
    while ((match = toolRegex.exec(content)) !== null) {
        const name = (match[1] || match[2]).replace(/["']/g, "").trim();
        const argsStr = match[3].trim();
        try {
            // Attempt 1: Strict JSON
            const args = JSON.parse(argsStr);
            tools.push({ name, args, raw: match[0] });
        } catch (e) {
            try {
                // Attempt 2: Sanitize Newlines in Strings (Common LLM error)
                // Regex matches double-quoted strings and escapes unescaped newlines inside them
                const sanitized = argsStr.replace(/"((?:[^"\\]|\\.)*)"/g, (match) => {
                     // Replace literal newlines with escaped newlines
                    return match.replace(/\n/g, "\\n").replace(/\r/g, "");
                });
                const args = JSON.parse(sanitized);
                tools.push({ name, args, raw: match[0] });
            } catch (e2) {
                // Attempt 3: Relaxed + Sanitized (Desperate fallback)
                try {
                    const fixed = argsStr
                        .replace(/'/g, '"') // Replace single quotes
                        .replace(/,\s*}/g, '}') // Remove trailing comma
                        // Sanitize newlines in the now-double-quoted strings
                        .replace(/"((?:[^"\\]|\\.)*)"/g, (m) => m.replace(/\n/g, "\\n").replace(/\r/g, ""));
                    
                    const args = JSON.parse(fixed);
                    tools.push({ name, args, raw: match[0] });
                } catch (e3) {
                    console.error(`Failed to parse args for tool ${name}`, argsStr);
                    tools.push({ name, args: {}, error: "Invalid JSON arguments", raw: match[0] });
                }
            }
        }
    }
    return tools;
}

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
                
                // Model Selection Logic
                let modelId = MODEL_LOW_POWER; // Safe fallback
                const configModel = config.localAI.model;

                if (!configModel || configModel === 'Auto') {
                    modelId = isHighPower ? MODEL_STANDARD : MODEL_LOW_POWER;
                } else {
                    modelId = configModel;
                }
                
                setLoadedModel(modelId);

                // Initialize WebLLM
                if (!localLlmService.isInitialized()) {
                    setLocalAIStatus(`Sage (Waking up ${modelId.includes('8B') ? '8B' : '1B'}...)`);
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
        const config = await settingsManager.getConfig();
        const useLocal = config.localAI.enabled;
        let finalContent = "";

        // 1. LOCAL AI ATTEMPT
        if (useLocal) {
            try {
                // Ensure initialized
                if (!localLlmService.isInitialized()) {
                    // Quick weight...
                    await new Promise(r => setTimeout(r, 1000));
                    if (!localLlmService.isInitialized()) throw new Error("Local AI not ready");
                }

                // Truncate Context to prevent OOM (4096 token limit ~ 16k chars total, reserve space for prompt/history)
                // Reduced to 6000 to be safe on 4GB VRAM GPUs (allows ~1500 tokens for RAG)
                const MAX_CONTEXT_CHARS = 6000;
                const safeContext = context.length > MAX_CONTEXT_CHARS 
                    ? context.substring(0, MAX_CONTEXT_CHARS) + "\n...(truncated)" 
                    : context;

                const systemMsg = `${SYSTEM_PROMPT}\n${safeContext}`;
                
                // Filter out system tool reports so AI doesn't mimic them
                // This prevents the "hallucination" where AI just prints the result text
                const cleanHistory = history.filter(m => !m.content.startsWith('> **Tool'));

                const messages: AIChatMessage[] = [
                    { role: 'system', content: systemMsg },
                    ...cleanHistory,
                    { role: 'user', content: userMsg }
                ];

                await localLlmService.chat(messages, (chunk) => {
                    finalContent += chunk;
                    onUpdate(chunk); 
                }, { temperature: 0.1 }); // STRICT GROUNDING: Low temp to prevent hallucinations
                
                console.log("[Raw AI Output]:", finalContent);

                // Post-Processing: Check for Tools
                const tools = parseLocalToolCalls(finalContent);
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
                    }, { temperature: 0.1 });
                }
                
                return; // Success, exit.

            } catch (e) {
                console.warn("Local AI Failed, falling back to Cloud", e);
                // Fall through to Cloud
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
            onUpdate(`\n\n**Error**: ${e.message}`);
        }

    }, [rateLimitCooldown]);

    return {
        isReady,
        localAIStatus,
        downloadProgress,
        chat,
        isLowPowerDevice,
        loadedModel
    };
}

