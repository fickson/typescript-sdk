import type { PolicyEnforcer } from '../policy-enforcer';
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
  private _policyEnforcer?: PolicyEnforcer;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.maxTokens = config.maxTokens || this.getMaxTokensForModel(config.model);
  }

  setPolicyEnforcer(enforcer: PolicyEnforcer): void {
    this._policyEnforcer = enforcer;
  }

  getPolicyEnforcer(): PolicyEnforcer | undefined {
    return this._policyEnforcer;
  }

  protected enforcePreCall(): void {
    if (!this._policyEnforcer) return;
    this._policyEnforcer.enforceModel(this.model);
    this._policyEnforcer.enforceRateLimit('request');
  }

  protected enforcePostCall(usage?: { total_tokens: number }): void {
    if (!this._policyEnforcer || !usage) return;
    this._policyEnforcer.enforceRateLimit('token', usage.total_tokens);
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
