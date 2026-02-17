import { BaseLLMProvider } from './base-provider';
import type { ChatChunk, ChatOptions, ChatResponse, LLMProviderConfig, Message } from './types';
export declare class OllamaProvider extends BaseLLMProvider {
    private baseUrl;
    constructor(config: LLMProviderConfig);
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    getProviderName(): string;
    protected getMaxTokensForModel(_model: string): number;
}
