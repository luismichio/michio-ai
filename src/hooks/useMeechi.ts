import { useState, useEffect, useRef, useCallback } from 'react';
import { localLlmService } from '@/lib/ai/local-llm';
import { settingsManager } from '@/lib/settings';
import { AIChatMessage, AITool } from '@/lib/ai/types';

// Constants for Models
const MODEL_LOW_POWER = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
// const MODEL_STANDARD = 'Llama-3.1-8B-Instruct-q4f32_1-MLC'; 
const MODEL_STANDARD = 'Llama-3.1-8B-Instruct-q4f32_1-MLC';

export function useMeechi() {
    // Default to TRUE for low settings to prevent GPU crash, then only upgrade if powerful
    const [isLowPowerDevice, setIsLowPowerDevice] = useState(true);
    const [localAIStatus, setLocalAIStatus] = useState<string>("");
    const [downloadProgress, setDownloadProgress] = useState<{ percentage: number, text: string } | null>(null);
    const [isReady, setIsReady] = useState(false);

    // Hardware Detection & Pre-warming
    useEffect(() => {
        // Helper to get GPU info
        async function getHardwareInfo() {
            let info: any = {};
            if ('gpu' in navigator) {
                try {
                    const adapter = await navigator.gpu.requestAdapter();
                    if (adapter) {
                        if (adapter.info) {
                            info = adapter.info;
                        } else if (typeof adapter.requestAdapterInfo === 'function') {
                            info = await adapter.requestAdapterInfo();
                        }
                    }
                } catch (e) {
                    console.warn("WebGPU detection failed", e);
                }
            }
            return info;
        }

        async function detectAndInit() {
            const config = await settingsManager.getConfig();
            console.log("[Meechi] Init Hook Triggered. Config Enable:", config.localAI.enabled);
            
            if (config.localAI.enabled) {
                try {
                    setLocalAIStatus("Detecting Hardware...");
                    
                    // Hardware Check
                    const info = await getHardwareInfo();
                    console.log("[Meechi] Hardware detected:", info.renderer);
                    
                    let lowPower = true; 
                    // Override for High-End Nvidia
                    if (info.renderer && /RTX (3090|4080|4090|A6000)/i.test(info.renderer)) {
                         lowPower = false;
                    }
                    // Apple Silicon M1/M2/M3 -> High Power usually fine for 8B
                    if (info.vendor === 'apple') lowPower = false;

                    setIsLowPowerDevice(lowPower);
                    console.log("[Meechi] Using Model:", lowPower ? "Llama-3.2-1B (Low Power)" : "Llama-3.1-8B (High Power)");

                    const modelId = lowPower
                        ? "Llama-3.2-1B-Instruct-q4f16_1-MLC" 
                        : "Llama-3.1-8B-Instruct-q4f32_1-MLC";

                    setLocalAIStatus(`Sage (Local - Loading ${lowPower ? '1B' : '8B'}...)`);
                    
                    const contextWindow = config.context_window || 8192; 
                    
                    console.log("[Meechi] Calling Initialize Service...", { modelId, contextWindow });
                    
                    await localLlmService.initialize(modelId, (progress) => {
                         if (progress.includes("Fetching") || progress.includes("Loading")) {
                             const match = progress.match(/(\d+)%/);
                             if (match) {
                                 setDownloadProgress({ percentage: parseInt(match[1]), text: progress });
                                 setLocalAIStatus(`Deep Thinking... (Loading ${match[1]}%)`);
                             }
                         }
                    }, { context_window: contextWindow });
                    
                    console.log("[Meechi] Initialize Service Returned!");
                    setIsReady(true);
                    setLocalAIStatus("");
                    setDownloadProgress(null);
                } catch (err) {
                    console.error("Meechi initialization failed:", err);
                    setLocalAIStatus("Hibernating (Init Failed)");
                }
            }
        }
        
        detectAndInit();
    }, []);

    // Encapsulated Chat Function
    const chat = useCallback(async (
        userMsg: string, 
        history: AIChatMessage[], 
        context: string,
        onUpdate: (chunk: string) => void
    ) => {
        // Hybrid Logic:
        // By default, we might use Groq (Sprint) via API route if online.
        // But here we implement the "Sage" layer (Local).
        // The calling component will handle the "Sprint" fallback first, 
        // OR we can do it here.
        // User instruction: "If Local Engine status is not 'ready', default to Groq."
        
        // Actually, the calling code (page.tsx) currently has the complex switching logic.
        // We should move the LOCAL part here primarily. 
        
        const timestamp = new Date().toLocaleTimeString();
        
        try {
            // Auto-Wait: If not ready, wait up to 60s (Model loading can be slow)
            if (!localLlmService.isInitialized()) {
                console.log("[Meechi] Chat called before ready. Waiting up to 60s...");
                setLocalAIStatus("Waking up...");
                let attempts = 0;
                // 120 * 500ms = 60 seconds
                while (!localLlmService.isInitialized() && attempts < 120) {
                    if (attempts % 4 === 0) { // Log every 2 seconds
                         console.log(`[Meechi] Still waking up... (${attempts/2}s elapsed)`);
                    }
                    await new Promise(r => setTimeout(r, 500));
                    attempts++;
                }
                if (!localLlmService.isInitialized()) {
                    throw new Error("Meechi is still waking up... Please try again in a moment.");
                }
            }

            // SHORT-CIRCUIT: Handle basic greetings locally to prevent hallucinations
            // Cleaning includes removing punctuation, extra spaces, and newlines
            const cleanMsg = userMsg.toLowerCase().replace(/[^\w\s]/g, '').trim(); 
            console.log(`[Meechi] Checking greeting short-circuit for: "${userMsg}" -> "${cleanMsg}"`);
            
            // Matches "hi", "hello", "hey", "greetings", "hi meechi", "hello meechi"
            // Using a simple split check to avoid complex regex failing on edge cases
            const words = cleanMsg.split(/\s+/);
            const isGreeting = (words.length <= 3) && (
                ['hi', 'hello', 'hey', 'greetings', 'hola', 'yo'].includes(words[0])
            );

            if (isGreeting) {
                 console.log("[Meechi] Short-circuiting greeting response.");
                 const reply = "Hello! I am Meechi. How can I help you today?";
                 onUpdate(reply); 
                 return reply;
            }

            const toolPrompt = `
IMPORTANT INSTRUCTIONS:
1. You are Meechi, a helpful AI assistant.
2. You have access to these tools:
   - move_file(sourcePath, destinationPath)
   - create_file(filePath, content)
   - update_file(filePath, newContent, oldContent)
   - fetch_url(url)
   
3. To use a tool, output a JSON object with this EXACT structure:
   { "tool": "tool_name", "args": { ... } }
   
   OR use this tag format:
   <function$tool_name{"key": "value"}>

   Example: <function$fetch_url{"url": "https://example.com"}>

4. PRIORITIZE CONTEXT: Check "Context" below.
5. ANSWER MODE: If the user just says "hi" or asks a question, REPLY WITH TEXT ONLY. 
   - DO NOT use 'update_user_settings' unless the user explicitly says "Change my name" or "Call me X".
   - DO NOT use tools for general conversation.
`;
            
            // Context Strategy: Small models ignore System Context if history is long.
            // We inject context directly into the LAST User message for maximum attention.
            
            // Construct Messages
            const messages: AIChatMessage[] = [
                { role: 'system', content: toolPrompt },
                 ...history.map(m => ({ 
                     role: m.role, 
                     // Strip out any previous tool calls from history
                     content: m.content.replace(/<function[\s\S]*?(?:<\/function>|$)/gi, '').trim() || m.content
                 })), 
                { role: 'user', content: "[CONTEXT FROM FILES]\n" + context + "\n\n[USER QUESTION]\n" + userMsg }
            ];

            let fullResponse = "";
            let tokenCount = 0;
            const startTime = Date.now();

            await localLlmService.chat(messages, (chunk) => {
                fullResponse += chunk;
                tokenCount++;
                
                // POISON FILTER: Check if the model is loop-outputting the settings confirmation
                // This happens when context is poisoned by previous errors.
                if (fullResponse.startsWith("Settings updated") || fullResponse.startsWith("I will call you")) {
                    console.warn("[Meechi] Detected poisoned output (Onboarding loop). Suppressing.");
                    // We don't update the UI with this junk
                    return;
                }

                // Perf Check
                const elapsed = (Date.now() - startTime) / 1000;
                if (elapsed > 1 && (tokenCount / elapsed) < 10) {
                     setLocalAIStatus("Sage is reflecting deeply...");
                } else {
                     setLocalAIStatus("");
                }

                onUpdate(chunk);
            });
            
            // Final check before returning
            if (fullResponse.startsWith("Settings updated") || fullResponse.startsWith("I will call you")) {
                 return "I apologize, I seemed to be distracted. What were you asking?";
            }

            return fullResponse;

        } catch (error) {
            throw error;
        }
    }, [isReady]);

    return {
        isLowPowerDevice,
        isReady,
        localAIStatus,
        downloadProgress,
        chat
    };
}
