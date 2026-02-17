import { BaseLLMProvider } from './base-provider';
import type { ChatChunk, ChatOptions, ChatResponse, LLMProviderConfig, Message } from './types';

let _Anthropic: any;
async function loadAnthropicSDK(): Promise<any> {
  if (!_Anthropic) {
    try {
      const mod = await import('@anthropic-ai/sdk');
      _Anthropic = mod.default || mod;
    } catch {
      throw new Error(
        '@anthropic-ai/sdk is required to use AnthropicProvider. Install it with: npm install @anthropic-ai/sdk'
      );
    }
  }
  return _Anthropic;
}

export class AnthropicProvider extends BaseLLMProvider {
  private client: any;

  constructor(config: LLMProviderConfig) {
    super(config);
  }

  static async create(config: LLMProviderConfig): Promise<AnthropicProvider> {
    const provider = new AnthropicProvider(config);
    const Anthropic = await loadAnthropicSDK();
    provider.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    return provider;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    try {
      const systemMessage = messages.find((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.max_tokens || 4096,
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop_sequences: options?.stop,
        system: systemMessage?.content || undefined,
        messages: conversationMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
        })),
      });

      const content = response.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('');

      return {
        content,
        model: response.model,
        finish_reason: response.stop_reason || undefined,
        usage: {
          prompt_tokens: response.usage.input_tokens,
          completion_tokens: response.usage.output_tokens,
          total_tokens: response.usage.input_tokens + response.usage.output_tokens,
        },
      };
    } catch (error) {
      throw new Error(`Anthropic API error: ${(error as Error).message}`);
    }
  }

  async *chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    try {
      const systemMessage = messages.find((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');

      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: options?.max_tokens || 4096,
        temperature: options?.temperature,
        top_p: options?.top_p,
        stop_sequences: options?.stop,
        system: systemMessage?.content || undefined,
        messages: conversationMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content || '',
        })),
        stream: true,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield {
              content: event.delta.text,
            };
          }
        } else if (event.type === 'message_stop') {
          yield {
            content: '',
            finish_reason: 'stop',
          };
        }
      }
    } catch (error) {
      throw new Error(`Anthropic streaming error: ${(error as Error).message}`);
    }
  }

  getProviderName(): string {
    return 'anthropic';
  }

  protected getMaxTokensForModel(model: string): number {
    if (model.includes('claude-opus-4')) return 200000;
    if (model.includes('claude-sonnet-4')) return 200000;
    if (model.includes('claude-haiku-4')) return 200000;
    if (model.includes('claude-3-7-sonnet')) return 200000;
    if (model.includes('claude-3-5')) return 200000;
    if (model.includes('claude-3-opus')) return 200000;
    if (model.includes('claude-3-sonnet')) return 200000;
    if (model.includes('claude-3-haiku')) return 200000;
    if (model.includes('claude-2')) return 100000;
    return 200000;
  }
}
