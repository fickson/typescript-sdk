import { BaseLLMProvider } from './base-provider';
import type { ChatChunk, ChatOptions, ChatResponse, LLMProviderConfig, Message } from './types';
export declare class GoogleProvider extends BaseLLMProvider {
    private client;
    constructor(config: LLMProviderConfig);
    static create(config: LLMProviderConfig): Promise<GoogleProvider>;
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    getProviderName(): string;
    protected getMaxTokensForModel(model: string): number;
    private buildTools;
    private buildHistory;
}
