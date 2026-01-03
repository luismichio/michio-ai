import { CreateWebWorkerMLCEngine, MLCEngineInterface } from "@mlc-ai/web-llm";
import { AIChatMessage, AITool } from "./types";
import { getModelConfig } from "./registry";
import { gpuLock } from "./gpu-lock";

export class WebLLMService {
    private engine: MLCEngineInterface | null = null;
    private loading: boolean = false;
    private currentModelId: string | null = null;
    private initPromise: Promise<void> | null = null;
    private progressListeners: ((text: string) => void)[] = [];
    private worker: Worker | null = null;

    /**
     * Connect to or Initialize the Engine via Web Worker
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
                console.log("[Meechi] Initializing via Dedicated Web Worker...");

                // Ensure previous engine is unloaded to free GPU memory
                if (this.engine) {
                    try {
                        console.log("[Meechi] Unloading previous engine...");
                        await this.engine.unload();
                        // Terminate old worker to fully free memory
                        if (this.worker) {
                            this.worker.terminate();
                            this.worker = null;
                        }
                    } catch (e) {
                        console.warn("[Meechi] Failed to clean unload:", e);
                    }
                    this.engine = null;
                }
                
                // Get Model Config
                const modelConfig = getModelConfig(modelId);
                const safeContext = config.context_window || modelConfig?.context_window || 4096;

                // Create new Worker
                this.worker = new Worker(new URL('./llm.worker.ts', import.meta.url), { type: 'module' });
                
                this.engine = await CreateWebWorkerMLCEngine(this.worker, modelId, {
                    initProgressCallback: (progress) => {
                        this.progressListeners.forEach(cb => cb(progress.text));
                    },
                }, {
                    context_window_size: safeContext,
                });
                
                this.currentModelId = modelId;
            } catch (error: any) {
                console.error("Failed to initialize WebLLM:", error);
                
                // FORCE RESET on error
                if (this.engine) {
                    try { await this.engine.unload(); } catch {} 
                    this.engine = null;
                }
                if (this.worker) {
                    this.worker.terminate();
                    this.worker = null;
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
        options: { tools?: AITool[]; temperature?: number; top_p?: number; stop?: string[] } = {}
    ): Promise<string> {
        if (!this.engine) {
            throw new Error("Local Engine not initialized");
        }

        // ACQUIRE GPU LOCK
        // This stops RAG from trying to embed while we are generating tokens
        await gpuLock.acquire('Chat');

        let fullResponse = "";
        
        try {
            const completion = await this.engine.chat.completions.create({
                messages: messages as any,
                stream: true,
                temperature: options.temperature ?? 0.7, 
                top_p: options.top_p ?? 0.9,
                stop: options.stop,
                frequency_penalty: 0.1, // Slight penalty to prevent infinite loops "The user has asked..."
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
             if (errMsg.includes("Context lost") || errMsg.includes("Device was lost") || errMsg.includes("Instance reference no longer exists") || errMsg.includes("dropped in popErrorScope") || errMsg.includes("already been disposed")) {
                 console.warn("GPU Crash detected. Resetting WebLLM engine state...");
                 this.engine = null;
                 this.currentModelId = null;
                 if (this.worker) {
                     this.worker.terminate();
                     this.worker = null;
                 }
                 // Propagate a specific error for the UI to handle (e.g., suggest reload)
                 throw new Error("GPU_CRASH");
             }
             throw e;
        } finally {
            // RELEASE GPU LOCK
            gpuLock.release();
        }

        return fullResponse;
    }
    
    isLoading() {
        return this.loading;
    }

    getModelId() {
        return this.currentModelId;
    }

    async interrupt() {
        if (this.engine) {
            await this.engine.interruptGenerate();
        }
    }
}

export const localLlmService = new WebLLMService();

