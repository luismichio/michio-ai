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

                // Ensure previous engine is unloaded to free GPU memory
                if (this.engine) {
                    try {
                        console.log("[Meechi] Unloading previous engine...");
                        await this.engine.unload();
                    } catch (e) {
                        console.warn("[Meechi] Failed to clean unload:", e);
                    }
                    this.engine = null;
                }
                
                // CORRECT CONFIGURATION FOR CONTEXT WINDOW
                // Lowering default context to 4096 to prevent OOM/Device Lost on mid-range GPUs
                const SAFE_CONTEXT_WINDOW = 4096;
                
                this.engine = await CreateMLCEngine(modelId, {
                    initProgressCallback: (progress) => {
                        this.progressListeners.forEach(cb => cb(progress.text));
                    },
                    // @ts-ignore
                    context_window_size: SAFE_CONTEXT_WINDOW
                }, {
                    context_window_size: SAFE_CONTEXT_WINDOW,
                });
                
                this.currentModelId = modelId;
            } catch (error: any) {
                console.error("Failed to initialize WebLLM:", error);
                
                // FORCE RESET on error
                if (this.engine) {
                    try { await this.engine.unload(); } catch {} 
                    this.engine = null;
                }
                this.currentModelId = null;

                // Check for GPU Context Lost
                if (error.message?.includes("Context lost") || error.message?.includes("valid external Instance")) {
                    console.warn("GPU Context Lost detected during init. Clearing state...");
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
        options: { tools?: AITool[]; temperature?: number; top_p?: number } = {}
    ): Promise<string> {
        if (!this.engine) {
            throw new Error("Local Engine not initialized");
        }

        // Convert messages to format expected by WebLLM if necessary
        // WebLLM accepts { role: "user" | "assistant" | "system", content: string }
        // Our AIChatMessage is compatible.
        
        let fullResponse = "";
        
        try {
            const completion = await this.engine.chat.completions.create({
                messages: messages as any, // Cast to avoid minor type mismatches if any
                stream: true,
                temperature: options.temperature ?? 0.7, // Default to 0.7 if not specified
                top_p: options.top_p ?? 0.9,
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
