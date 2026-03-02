import { BaseLLMProvider } from './base-provider';
import type { ChatChunk, ChatOptions, ChatResponse, LLMProviderConfig, Message } from './types';

let _googleGenAI: any;
let _harmCategory: any;
let _harmBlockThreshold: any;

async function loadGoogleSDK() {
  if (!_googleGenAI) {
    try {
      const mod = await import('@google/genai');
      _googleGenAI = mod.GoogleGenAI;
      _harmCategory = mod.HarmCategory;
      _harmBlockThreshold = mod.HarmBlockThreshold;
    } catch {
      throw new Error(
        '@google/genai is required to use GoogleProvider. Install it with: npm install @google/genai'
      );
    }
  }
  return {
    GoogleGenAI: _googleGenAI,
    HarmCategory: _harmCategory,
    HarmBlockThreshold: _harmBlockThreshold,
  };
}

export class GoogleProvider extends BaseLLMProvider {
  private client: any;

  constructor(config: LLMProviderConfig) {
    super(config);
  }

  static async create(config: LLMProviderConfig): Promise<GoogleProvider> {
    const provider = new GoogleProvider(config);
    const { GoogleGenAI } = await loadGoogleSDK();
    provider.client = new GoogleGenAI({ apiKey: config.apiKey });
    return provider;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    this.enforcePreCall();
    try {
      const { HarmCategory, HarmBlockThreshold } = await loadGoogleSDK();
      const tools = this.buildTools(options);
      const systemMessage = messages.find((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');
      const history = this.buildHistory(conversationMessages.slice(0, -1));
      const lastMessage = conversationMessages[conversationMessages.length - 1]?.content || '';

      const prompt = systemMessage
        ? `${systemMessage.content}\n\nUser: ${lastMessage}`
        : lastMessage;

      const chat = this.client.chats.create({
        model: this.model,
        history,
        config: {
          temperature: options?.temperature,
          maxOutputTokens: options?.max_tokens,
          topP: options?.top_p,
          stopSequences: options?.stop,
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
          ...(tools && { tools }),
        },
      });

      const response = await chat.sendMessage({ message: prompt });

      const functionCalls = response.functionCalls;
      const tool_calls = functionCalls?.map((fc: any, index: number) => ({
        id: `call_${Date.now()}_${index}`,
        type: 'function' as const,
        function: {
          name: fc.name!,
          arguments: JSON.stringify(fc.args),
        },
      }));

      const content = functionCalls && functionCalls.length > 0 ? '' : (response.text ?? '');

      const usage = {
        prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata?.totalTokenCount || 0,
      };

      this.enforcePostCall(usage);

      return {
        content,
        model: this.model,
        finish_reason: response.candidates?.[0]?.finishReason || undefined,
        ...(tool_calls && tool_calls.length > 0 && { tool_calls }),
        usage,
      };
    } catch (error) {
      throw new Error(`Google API error: ${(error as Error).message}`);
    }
  }

  async *chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk> {
    this.enforcePreCall();
    try {
      const systemMessage = messages.find((m) => m.role === 'system');
      const conversationMessages = messages.filter((m) => m.role !== 'system');
      const history = this.buildHistory(conversationMessages.slice(0, -1));
      const lastMessage = conversationMessages[conversationMessages.length - 1]?.content || '';

      const prompt = systemMessage
        ? `${systemMessage.content}\n\nUser: ${lastMessage}`
        : lastMessage;

      const chat = this.client.chats.create({
        model: this.model,
        history,
        config: {
          temperature: options?.temperature,
          maxOutputTokens: options?.max_tokens,
          topP: options?.top_p,
          stopSequences: options?.stop,
        },
      });

      const stream = await chat.sendMessageStream({ message: prompt });

      for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
          yield { content: text };
        }
      }

      yield { content: '', finish_reason: 'stop' };
    } catch (error) {
      throw new Error(`Google streaming error: ${(error as Error).message}`);
    }
  }

  getProviderName(): string {
    return 'google';
  }

  protected getMaxTokensForModel(model: string): number {
    if (model.includes('gemini-3')) return 1000000;
    if (model.includes('gemini-2.5')) return 1000000;
    if (model.includes('gemini-2.0-flash')) return 1000000;
    if (model.includes('gemini-1.5-pro')) return 2000000;
    if (model.includes('gemini-1.5-flash')) return 1000000;
    if (model.includes('gemini-pro')) return 32768;
    return 1000000;
  }

  private buildTools(options?: ChatOptions): any[] | undefined {
    if (!options?.tools) return undefined;
    return [
      {
        functionDeclarations: options.tools.map((t) => ({
          name: t.function.name,
          description: t.function.description || '',
          parameters: t.function.parameters as any,
        })),
      },
    ];
  }

  private buildHistory(messages: Message[]): any[] {
    return messages.map((m) => {
      if (m.role === 'assistant') {
        if (m.tool_calls && m.tool_calls.length > 0) {
          return {
            role: 'model' as const,
            parts: m.tool_calls.map((tc) => ({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments || '{}'),
              },
            })),
          };
        }
        return { role: 'model' as const, parts: [{ text: m.content || '' }] };
      } else if (m.role === 'tool') {
        let responseData: Record<string, unknown>;
        try {
          responseData = JSON.parse(m.content || '{}');
        } catch {
          responseData = { result: m.content };
        }
        return {
          role: 'user' as const,
          parts: [
            {
              functionResponse: {
                name: (m as any).name,
                response: responseData,
              },
            },
          ],
        };
      } else {
        return { role: 'user' as const, parts: [{ text: m.content || '' }] };
      }
    });
  }
}
