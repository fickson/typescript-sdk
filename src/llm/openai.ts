import { BaseLLMProvider } from './base-provider';
import type { ChatChunk, ChatOptions, ChatResponse, LLMProviderConfig, Message } from './types';

let _OpenAI: any;
async function loadOpenAISDK(): Promise<any> {
  if (!_OpenAI) {
    try {
      const mod = await import('openai');
      _OpenAI = mod.default || mod;
    } catch {
      throw new Error(
        'openai is required to use OpenAIProvider. Install it with: npm install openai'
      );
    }
  }
  return _OpenAI;
}

export class OpenAIProvider extends BaseLLMProvider {
  private client: any;

  constructor(config: LLMProviderConfig) {
    super(config);
  }

  static async create(config: LLMProviderConfig): Promise<OpenAIProvider> {
    const provider = new OpenAIProvider(config);
    const OpenAI = await loadOpenAISDK();
    provider.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      organization: config.organization,
    });
    return provider;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.enforcePreCall();
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any[],
        temperature: options?.temperature,
        max_tokens: options?.max_tokens,
        top_p: options?.top_p,
        frequency_penalty: options?.frequency_penalty,
        presence_penalty: options?.presence_penalty,
        stop: options?.stop,
        stream: false,
        tools: options?.tools as any[] | undefined,
      });

      const usage = response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined;

      this.enforcePostCall(usage);

      return {
        content: response.choices[0]?.message?.content || '',
        model: response.model,
        finish_reason: response.choices[0]?.finish_reason || undefined,
        tool_calls: response.choices[0]?.message?.tool_calls?.filter(
          (tc: any) => tc.type === 'function' && 'function' in tc
        ),
        usage,
      };
    } catch (error) {
      throw new Error(`OpenAI API error: ${(error as Error).message}`);
    }
  }

  async *chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    this.enforcePreCall();
    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as any[],
        temperature: options?.temperature,
        max_tokens: options?.max_tokens,
        top_p: options?.top_p,
        frequency_penalty: options?.frequency_penalty,
        presence_penalty: options?.presence_penalty,
        stop: options?.stop,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        const finishReason = chunk.choices[0]?.finish_reason || undefined;

        if (content || finishReason) {
          yield {
            content,
            finish_reason: finishReason,
          };
        }
      }
    } catch (error) {
      throw new Error(`OpenAI streaming error: ${(error as Error).message}`);
    }
  }

  getProviderName(): string {
    return 'openai';
  }

  protected getMaxTokensForModel(model: string): number {
    if (model.includes('gpt-5')) return 1000000;
    if (model.includes('o4-mini')) return 200000;
    if (model.includes('o3')) return 200000;
    if (model.includes('o1')) return 200000;
    if (model.includes('gpt-4.1')) return 1000000;
    if (model.includes('gpt-4o-mini')) return 128000;
    if (model.includes('gpt-4o')) return 128000;
    if (model.includes('gpt-4-turbo') || model.includes('gpt-4-1106')) return 128000;
    if (model.includes('gpt-4-32k')) return 32768;
    if (model.includes('gpt-4')) return 8192;
    if (model.includes('gpt-3.5-turbo-16k')) return 16385;
    if (model.includes('gpt-3.5-turbo')) return 4096;
    return 1000000;
  }
}
