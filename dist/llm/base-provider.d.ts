import type { ChatChunk, ChatOptions, ChatResponse, LLMProvider, LLMProviderConfig, Message } from './types';
export declare abstract class BaseLLMProvider implements LLMProvider {
    protected model: string;
    protected maxTokens: number;
    constructor(config: LLMProviderConfig);
    abstract chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    abstract chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    abstract getProviderName(): string;
    protected abstract getMaxTokensForModel(model: string): number;
    countTokens(text: string): number;
    getMaxTokens(): number;
    getModelName(): string;
}
