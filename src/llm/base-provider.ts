import type {
  ChatChunk,
  ChatOptions,
  ChatResponse,
  LLMProvider,
  LLMProviderConfig,
  Message,
} from './types';

export abstract class BaseLLMProvider implements LLMProvider {
  protected model: string;
  protected maxTokens: number;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.maxTokens = config.maxTokens || this.getMaxTokensForModel(config.model);
  }

  abstract chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  abstract chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
  abstract getProviderName(): string;
  protected abstract getMaxTokensForModel(model: string): number;

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getMaxTokens(): number {
    return this.maxTokens;
  }

  getModelName(): string {
    return this.model;
  }
}
