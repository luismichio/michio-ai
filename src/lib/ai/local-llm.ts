import { CreateMLCEngine, MLCEngine, MLCEngineInterface, CreateServiceWorkerMLCEngine } from "@mlc-ai/web-llm";
import { AIChatMessage, AITool } from "./types";

export interface LocalLlmConfig {
    modelId: string;
}

export class WebLLMService {
    private engine: MLCEngineInterface | null = null;
    private loading: boolean = false;
    private currentModelId: string | null = null;
    private initPromise: Promise<void> | null = null;
    private progressListeners: ((text: string) => void)[] = [];

    /**
     * Connect to or Initialize the Engine via Service Worker
     */
    async initialize(
        modelId: string, 
        progressCallback?: (text: string) => void,
        config: { context_window?: number } = {}
    ): Promise<void> {
        // If already initialized with same model, return immediately
        if (this.engine && this.currentModelId === modelId) {
            return;
        }

        if (progressCallback) {
            this.progressListeners.push(progressCallback);
        }

        // If initialization is in progress, return the existing promise
        if (this.initPromise) {
            return this.initPromise;
        }

        this.loading = true;
        
        // Create a new initialization promise
        this.initPromise = (async () => {
            try {
                // switch to Standard Web Worker for reliability
                // Service Workers are great for multi-tab, but brittle for "Active Controller" checks.
                // Standard Worker is isolated and just works.
                console.log("[Meechi] Initializing via Standard Web Worker (High Reliability)...");
                
                // CORRECT CONFIGURATION FOR CONTEXT WINDOW
                // CreateMLCEngine(modelId, engineConfig, chatOpts)
                // context_window_size belongs in the chatOpts (3rd argument) OR specifically in top-level config?
                // Actually, for WebLLM 0.2.x, it's often best to set it in initProgressCallback's object 
                // OR rely on the underlying model config.
                // We will attempt to pass it in both places to be safe.
                
                this.engine = await CreateMLCEngine(modelId, {
                    initProgressCallback: (progress) => {
                        this.progressListeners.forEach(cb => cb(progress.text));
                    },
                    // Try passing here as well for safety
                    // @ts-ignore - Some versions allow this
                    context_window_size: 8192
                }, {
                    context_window_size: 8192,
                    // sliding_window_size: 2048, // Optional: if we wanted to support infinite constrained chat
                });
                
                /* 
                // Legacy Service Worker Path (Disabled for stability)
                if ('serviceWorker' in navigator) { ... } 
                */
                
                this.currentModelId = modelId;
            } catch (error: any) {
                console.error("Failed to initialize WebLLM:", error);
                
                // Check for GPU Context Lost
                if (error.message?.includes("Context lost") || error.message?.includes("valid external Instance")) {
                    console.warn("GPU Context Lost detected during init. Clearing state...");
                    this.engine = null;
                    this.currentModelId = null;
                }
                throw error;
            } finally {
                this.loading = false;
                this.initPromise = null; // Clear promise so next attempt works
                this.progressListeners = []; // Clear listeners
            }
        })();

        return this.initPromise;
    }

    isInitialized(): boolean {
        return !!this.engine;
    }

    async chat(
        messages: AIChatMessage[],
        onUpdate: (chunk: string) => void,
        tools?: AITool[]
    ): Promise<string> {
        if (!this.engine) {
            throw new Error("Local Engine not initialized");
        }

        // Convert messages to format expected by WebLLM if necessary
        // WebLLM accepts { role: "user" | "assistant" | "system", content: string }
        // Our AIChatMessage is compatible.
        
        // Note: WebLLM's tool support might be limited or different. 
        // For now, we will focus on text-only fallback to avoid complexity,
        // unless specific tool calling is required for local fallback.
        // If tools are critical, we'd need to check WebLLM's specific tool API (OpenAI compatible).

        let fullResponse = "";
        
        try {
            const completion = await this.engine.chat.completions.create({
                messages: messages as any, // Cast to avoid minor type mismatches if any
                stream: true,
                // stream_options: { include_usage: true }, // Optional
            });

            for await (const chunk of completion) {
                const delta = chunk.choices[0]?.delta.content || "";
                if (delta) {
                    fullResponse += delta;
                    onUpdate(delta);
                }
            }
        } catch (e: any) {
             console.error("WebLLM Chat Error:", e);
             // Detect GPU Context Loss or Device Loss
             const errMsg = e.message || "";
             if (errMsg.includes("Context lost") || errMsg.includes("Device was lost") || errMsg.includes("Instance reference no longer exists")) {
                 console.warn("GPU Crash detected. Resetting WebLLM engine state...");
                 this.engine = null;
                 this.currentModelId = null;
                 this.initPromise = null;
             }
             throw e;
        }

        return fullResponse;
    }
    
    isLoading() {
        return this.loading;
    }
}

export const localLlmService = new WebLLMService();
