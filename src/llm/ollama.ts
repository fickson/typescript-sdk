import { BaseLLMProvider } from './base-provider';
import type { ChatChunk, ChatOptions, ChatResponse, LLMProviderConfig, Message } from './types';

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
    stop?: string[];
  };
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaProvider extends BaseLLMProvider {
  private baseUrl: string;

  constructor(config: LLMProviderConfig) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.enforcePreCall();
    try {
      const requestBody: OllamaChatRequest = {
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content || '',
        })),
        stream: false,
        options: {
          temperature: options?.temperature,
          top_p: options?.top_p,
          num_predict: options?.max_tokens,
          stop: options?.stop,
        },
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = (await response.json()) as OllamaChatResponse;

      const usage = {
        prompt_tokens: data.prompt_eval_count || 0,
        completion_tokens: data.eval_count || 0,
        total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      };

      this.enforcePostCall(usage);

      return {
        content: data.message.content,
        model: data.model,
        finish_reason: data.done ? 'stop' : undefined,
        usage,
      };
    } catch (error) {
      throw new Error(`Ollama API error: ${(error as Error).message}`);
    }
  }

  async *chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    this.enforcePreCall();
    try {
      const requestBody: OllamaChatRequest = {
        model: this.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content || '',
        })),
        stream: true,
        options: {
          temperature: options?.temperature,
          top_p: options?.top_p,
          num_predict: options?.max_tokens,
          stop: options?.stop,
        },
      };

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as OllamaChatResponse;

            if (data.message?.content) {
              yield {
                content: data.message.content,
              };
            }

            if (data.done) {
              yield {
                content: '',
                finish_reason: 'stop',
              };
            }
          } catch {
            // Non-JSON line in stream (e.g. empty or partial), skip
          }
        }
      }
    } catch (error) {
      throw new Error(`Ollama streaming error: ${(error as Error).message}`);
    }
  }

  getProviderName(): string {
    return 'ollama';
  }

  protected getMaxTokensForModel(_model: string): number {
    return 4096;
  }
}
