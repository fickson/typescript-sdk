import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SekuireCrypto } from '../crypto';
import { SekuireLogger } from '../logger';
import type { ActivePolicy } from '../policy';
import { PolicyEnforcer } from '../policy-enforcer';

const SAVED_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...SAVED_ENV };
});

const makePolicy = (content: any): ActivePolicy => ({
  policy_id: 'test-policy',
  workspace_id: 'ws-1',
  version: '1',
  status: 'active',
  hash: 'abc',
  content,
});

describe('Security: Production Override Protection', () => {
  it('should ignore dev override when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o'] } },
    });
    const enforcer = new PolicyEnforcer(policy, true);

    expect(() => enforcer.enforceModel('gpt-3.5-turbo')).toThrow();
    expect(enforcer.isOverrideEnabled()).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('ignored in production'));
    errorSpy.mockRestore();
  });

  it('should ignore SEKUIRE_POLICY_DEV_OVERRIDE env var in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.SEKUIRE_POLICY_DEV_OVERRIDE = 'true';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o'] } },
    });
    const enforcer = new PolicyEnforcer(policy);

    expect(() => enforcer.enforceModel('gpt-3.5-turbo')).toThrow();
    errorSpy.mockRestore();
  });

  it('should allow dev override in non-production environments', () => {
    process.env.NODE_ENV = 'development';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o'] } },
    });
    const enforcer = new PolicyEnforcer(policy, true);

    expect(() => enforcer.enforceModel('gpt-3.5-turbo')).not.toThrow();
    expect(enforcer.isOverrideEnabled()).toBe(true);
    warnSpy.mockRestore();
  });
});

describe('Security: Policy Immutability', () => {
  it('should freeze the policy content after construction', () => {
    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o'] } },
    });
    new PolicyEnforcer(policy);

    expect(() => {
      (policy as any).content = {};
    }).toThrow();
  });
});

describe('Security: LLM Provider Enforcement', () => {
  it('BaseLLMProvider should have setPolicyEnforcer method', async () => {
    const { BaseLLMProvider } = await import('../llm/base-provider');

    class TestProvider extends BaseLLMProvider {
      async chat() {
        return { content: '', model: 'test' };
      }
      async *chatStream() {
        yield { content: '' };
      }
      getProviderName() {
        return 'test';
      }
      protected getMaxTokensForModel() {
        return 4096;
      }
    }

    const provider = new TestProvider({ apiKey: 'test', model: 'test-model' });
    expect(typeof provider.setPolicyEnforcer).toBe('function');
  });

  it('BaseLLMProvider should enforce model policy on chat', async () => {
    const { BaseLLMProvider } = await import('../llm/base-provider');

    class TestProvider extends BaseLLMProvider {
      async chat() {
        this.enforcePreCall();
        return { content: 'ok', model: this.model };
      }
      async *chatStream() {
        yield { content: '' };
      }
      getProviderName() {
        return 'test';
      }
      protected getMaxTokensForModel() {
        return 4096;
      }
    }

    const provider = new TestProvider({ apiKey: 'test', model: 'gpt-3.5-turbo' });
    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o'] } },
    });
    provider.setPolicyEnforcer(new PolicyEnforcer(policy));

    await expect(provider.chat([])).rejects.toThrow('not allowed');
  });

  it('BaseLLMProvider should enforce rate limits on chat', async () => {
    const { BaseLLMProvider } = await import('../llm/base-provider');

    class TestProvider extends BaseLLMProvider {
      async chat() {
        this.enforcePreCall();
        return { content: 'ok', model: this.model };
      }
      async *chatStream() {
        yield { content: '' };
      }
      getProviderName() {
        return 'test';
      }
      protected getMaxTokensForModel() {
        return 4096;
      }
    }

    const provider = new TestProvider({ apiKey: 'test', model: 'gpt-4o' });
    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o'] } },
      rate_limits: { per_agent: { requests_per_minute: 2 } },
    });
    provider.setPolicyEnforcer(new PolicyEnforcer(policy));

    await provider.chat([]);
    await provider.chat([]);
    await expect(provider.chat([])).rejects.toThrow('Rate limit exceeded');
  });

  it('BaseLLMProvider should allow calls without enforcer', async () => {
    const { BaseLLMProvider } = await import('../llm/base-provider');

    class TestProvider extends BaseLLMProvider {
      async chat() {
        this.enforcePreCall();
        return { content: 'ok', model: this.model };
      }
      async *chatStream() {
        yield { content: '' };
      }
      getProviderName() {
        return 'test';
      }
      protected getMaxTokensForModel() {
        return 4096;
      }
    }

    const provider = new TestProvider({ apiKey: 'test', model: 'gpt-3.5-turbo' });
    const result = await provider.chat([]);
    expect(result.content).toBe('ok');
  });
});

describe('Security: Event Signing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should sign events when private key is provided', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const kp = SekuireCrypto.generateKeyPair();

    const logger = new SekuireLogger({
      sekuireId: 'test-id',
      fallback: 'console',
      privateKey: kp.privateKey,
    });

    logger.logEvent('tool_execution', 'info', { tool: 'calculator' });
    await logger.flush();

    const calls = writeSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('calculator')
    );
    expect(calls.length).toBe(1);

    const parsed = JSON.parse(calls[0][0] as string);
    expect(parsed.signature).toBeDefined();
    expect(typeof parsed.signature).toBe('string');
    expect(parsed.signature.length).toBe(128);

    const payload = JSON.stringify({
      sekuire_id: parsed.sekuire_id,
      event_type: parsed.event_type,
      event_timestamp: parsed.event_timestamp,
      event_data: parsed.event_data,
    });
    expect(SekuireCrypto.verify(payload, parsed.signature, kp.publicKey)).toBe(true);

    writeSpy.mockRestore();
    await logger.shutdown();
  });

  it('should not include signature when no private key', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const logger = new SekuireLogger({
      sekuireId: 'test-id',
      fallback: 'console',
    });

    logger.logEvent('tool_execution', 'info', { tool: 'calculator' });
    await logger.flush();

    const calls = writeSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('calculator')
    );
    const parsed = JSON.parse(calls[0][0] as string);
    expect(parsed.signature).toBeUndefined();

    writeSpy.mockRestore();
    await logger.shutdown();
  });
});

describe('Security: Missing Policy Warnings', () => {
  it('should warn when network permissions are not configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = makePolicy({});
    const enforcer = new PolicyEnforcer(policy);

    enforcer.enforceNetwork('example.com', 'https');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Network permissions not configured')
    );
    warnSpy.mockRestore();
  });

  it('should warn when filesystem permissions are not configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const policy = makePolicy({});
    const enforcer = new PolicyEnforcer(policy);

    enforcer.enforceFilesystem('/tmp/test', 'read');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Filesystem permissions not configured')
    );
    warnSpy.mockRestore();
  });
});
