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
export async function createLLMProvider(
  provider: string,
  config: LLMProviderConfig
): Promise<LLMProvider> {
  const normalizedProvider = provider.toLowerCase();

  switch (normalizedProvider) {
    case 'openai':
      return OpenAIProvider.create(config);

    case 'anthropic':
      return AnthropicProvider.create(config);

    case 'google':
    case 'gemini':
      return GoogleProvider.create(config);

    case 'ollama':
      return new OllamaProvider(config);

    default:
      throw new Error(
        `Unknown LLM provider: ${provider}. Supported providers: openai, anthropic, google, ollama`
      );
  }
}

/**
 * Factory functions for easy LLM instantiation
 */
export const llm = {
  openai: (config: Omit<LLMProviderConfig, 'model'> & { model?: string }) => {
    return OpenAIProvider.create({
      ...config,
      model: config.model || 'gpt-5.2',
    });
  },

  anthropic: (config: Omit<LLMProviderConfig, 'model'> & { model?: string }) => {
    return AnthropicProvider.create({
      ...config,
      model: config.model || 'claude-sonnet-4-6',
    });
  },

  google: (config: Omit<LLMProviderConfig, 'model'> & { model?: string }) => {
    return GoogleProvider.create({
      ...config,
      model: config.model || 'gemini-3.1-pro-preview',
    });
  },

  ollama: (config: Omit<LLMProviderConfig, 'model'> & { model?: string }) => {
    return new OllamaProvider({
      ...config,
      model: config.model || 'llama3.2',
    });
  },
};
