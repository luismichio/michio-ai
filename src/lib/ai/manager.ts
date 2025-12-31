import { AIProvider, AIChatMessage, AITool, AICompletion } from "./types";
import { GroqProvider } from "./providers/groq";
import { GeminiProvider } from "./providers/gemini";

export interface AIConfig {
    activeProviderId: string;
    providers: {
        id: string;
        apiKey?: string;
        model?: string;
    }[];
    identity?: {
        name: string;
        tone: string;
    };
}

export class AIManager {
    private providers: Map<string, AIProvider> = new Map();

    constructor() {
        // Register default providers
        this.registerProvider(new GroqProvider());
        this.registerProvider(new GeminiProvider());
    }

    registerProvider(provider: AIProvider) {
        this.providers.set(provider.id, provider);
    }

    async chat(
        userMessage: string,
        systemContext: string,
        history: AIChatMessage[],
        config: AIConfig,
        tools?: AITool[]
    ): Promise<AICompletion> {
        // 1. Determine Primary Provider
        const primaryId = config.activeProviderId || 'groq';
        let providerConfig = config.providers.find(p => p.id === primaryId);
        
        let provider = this.providers.get(primaryId);
        if (!provider) {
            console.warn(`Provider ${primaryId} not found. Falling back to Groq.`);
            provider = this.providers.get('groq')!;
        }

        // 2. Construct Messages
        // Inject Identity/Tone into System Prompt
        const identity = config.identity || { name: "Traveler", tone: "Casual" };
        const systemPrompt = `
You are Michio, a personal cognitive partner.
User Name: ${identity.name}
Tone: ${identity.tone}

If the User Name is "Traveler", it means the user has not introduced themselves yet.
If the user provides their name (e.g., "I'm Luis" or just "Luis"), YOU MUST use the \`update_user_settings\` tool to save it. DO NOT just reply with text.
If the user specifies a preferred tone, you must also use the \`update_user_settings\` tool.

Context:
${systemContext}
        `.trim();

        const messages: AIChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userMessage }
        ];

        // 3. Attempt Chat
        // We throw errors to let the client handle fallback (e.g. Local AI)
        return await provider.chat(
            providerConfig?.model || "",
            messages,
            tools,
            providerConfig?.apiKey
        );
    }
}

export const aiManager = new AIManager();
