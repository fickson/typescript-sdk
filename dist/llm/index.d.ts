import { AnthropicProvider } from './anthropic';
import { GoogleProvider } from './google';
import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';
import type { LLMProvider, LLMProviderConfig } from './types';
export * from './anthropic';
export * from './google';
export * from './ollama';
export * from './openai';
export * from './types';
/**
 * Create an LLM provider based on provider name
 */
export declare function createLLMProvider(provider: string, config: LLMProviderConfig): Promise<LLMProvider>;
/**
 * Factory functions for easy LLM instantiation
 */
export declare const llm: {
    openai: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => Promise<OpenAIProvider>;
    anthropic: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => Promise<AnthropicProvider>;
    google: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => Promise<GoogleProvider>;
    ollama: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => OllamaProvider;
};
