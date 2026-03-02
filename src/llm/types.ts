export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ToolCallFunction {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallFunction[];
}

export interface ChatOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  content: string;
  model: string;
  finish_reason?: string;
  tool_calls?: ToolCallFunction[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Streaming chunk from chat completion
 */
export interface ChatChunk {
  content: string;
  finish_reason?: string;
}

/**
 * Base interface for LLM providers
 */
export interface LLMProvider {
  chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
  chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
  countTokens(text: string): number;
  getMaxTokens(): number;
  getProviderName(): string;
  getModelName(): string;
  setPolicyEnforcer?(enforcer: unknown): void;
}

/**
 * Configuration for creating LLM providers
 */
export interface LLMProviderConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  organization?: string;
  temperature?: number;
  maxTokens?: number;
}
