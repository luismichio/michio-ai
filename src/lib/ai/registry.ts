import { SYSTEM_PROMPT } from './prompts';

export interface ModelConfig {
    id: string; // The WebLLM Model ID
    name: string; // Display Name
    family: 'llama' | 'gemma' | 'phi' | 'generic'; // For prompt formatting
    vram_required_mb: number; // estimated
    low_power: boolean; // Is this suitable for low power devices?
    context_window: number; // Max context
}

export const AVAILABLE_MODELS: ModelConfig[] = [
    {
        id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
        name: 'Llama 3.2 1B (Fastest)',
        family: 'llama',
        vram_required_mb: 1500,
        low_power: true,
        context_window: 4096
    },
    {
        id: 'Llama-3.1-8B-Instruct-q4f32_1-MLC',
        name: 'Llama 3.1 8B (Standard)',
        family: 'llama',
        vram_required_mb: 6000,
        low_power: false,
        context_window: 8192
    },
    // Adding a fallback/generic one just in case
    {
        id: 'TinyLlama-1.1B-Chat-v1.0-q4f16_1-MLC',
        name: 'TinyLlama 1.1B',
        family: 'llama', 
        vram_required_mb: 1000,
        low_power: true,
        context_window: 2048
    }
];

export function getModelConfig(modelId: string): ModelConfig | undefined {
    return AVAILABLE_MODELS.find(m => m.id === modelId);
}

// Factory for getting the right System Prompt based on Model Family
export function getSystemPromptForModel(modelId: string): string {
    const config = getModelConfig(modelId);
    if (!config) return SYSTEM_PROMPT; // Default

    // We can specialize prompts here if needed in the future
    // For now, Llama family works well with the default XML prompt
    return SYSTEM_PROMPT;
}
