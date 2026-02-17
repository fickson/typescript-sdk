import { BaseLLMProvider } from './base-provider';
import type { ChatChunk, ChatOptions, ChatResponse, LLMProviderConfig, Message } from './types';
export declare class OpenAIProvider extends BaseLLMProvider {
    private client;
    constructor(config: LLMProviderConfig);
    static create(config: LLMProviderConfig): Promise<OpenAIProvider>;
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    getProviderName(): string;
    protected getMaxTokensForModel(model: string): number;
}
