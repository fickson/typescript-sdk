import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import { SekuireCrypto } from '../crypto';
import { PolicyEnforcer } from '../policy-enforcer';
import type { ActivePolicy } from '../policy';
import { SekuireLogger } from '../logger';
import { SekuireSDK } from '../sdk';
import { loadConfig, getAgentConfig } from '../config/loader';

const SAVED_ENV = { ...process.env };

beforeAll(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('SEKUIRE_')) {
      delete process.env[key];
    }
  }
});

afterAll(() => {
  process.env = { ...SAVED_ENV };
});

describe('Standalone: Identity V2', () => {
  it('should produce deterministic output', () => {
    const params = { model: 'gpt-4o', systemPrompt: 'You are a helpful assistant.', tools: '[]' };
    expect(SekuireCrypto.calculateSekuireId(params)).toBe(SekuireCrypto.calculateSekuireId(params));
  });

  it('should match CLI reference vector', () => {
    const id = SekuireCrypto.calculateSekuireId({
      model: 'gpt-4o',
      systemPrompt: 'You are a helpful assistant.',
      tools: '[]',
    });
    expect(id).toBe('28da5805f90c0b2d7437e448f40853092cc38f5fa223cae21994a8b76d338b53');
  });

  it('should differ from legacy for same inputs', () => {
    const params = {
      model: 'gpt-4o',
      systemPrompt: 'You are a helpful assistant.',
      tools: '[]',
      projectName: 'MyAgent',
      projectVersion: '1.0.0',
    };
    const v2 = SekuireCrypto.calculateSekuireId(params);
    const legacy = SekuireCrypto.calculateSekuireIdLegacy(params);
    expect(v2).not.toBe(legacy);
  });

  it('should ignore projectName and projectVersion', () => {
    const base = { model: 'gpt-4o', systemPrompt: 'test', tools: '[]' };
    const withProject = { ...base, projectName: 'A', projectVersion: '1.0' };
    expect(SekuireCrypto.calculateSekuireId(base)).toBe(SekuireCrypto.calculateSekuireId(withProject));
  });

  it('should produce same ID regardless of JSON whitespace in tools', () => {
    const id1 = SekuireCrypto.calculateSekuireId({
      model: 'gpt-4o',
      systemPrompt: 'test',
      tools: '{ "a": 1,  "b":  2 }',
    });
    const id2 = SekuireCrypto.calculateSekuireId({
      model: 'gpt-4o',
      systemPrompt: 'test',
      tools: '{"a":1,"b":2}',
    });
    expect(id1).toBe(id2);
  });

  it('should trim prompt whitespace', () => {
    const id1 = SekuireCrypto.calculateSekuireId({
      model: 'gpt-4o', systemPrompt: '  hello  ', tools: '[]',
    });
    const id2 = SekuireCrypto.calculateSekuireId({
      model: 'gpt-4o', systemPrompt: 'hello', tools: '[]',
    });
    expect(id1).toBe(id2);
  });
});

describe('Standalone: Policy Enforcement', () => {
  const makePolicy = (content: any): ActivePolicy => ({
    policy_id: 'test-policy',
    workspace_id: 'ws-1',
    version: '1',
    status: 'active',
    hash: 'abc',
    content,
  });

  it('should enforce model allowlist', () => {
    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o', 'claude-3-5-sonnet'] } },
    });
    const enforcer = new PolicyEnforcer(policy);
    expect(() => enforcer.enforceModel('gpt-4o')).not.toThrow();
    expect(() => enforcer.enforceModel('gpt-3.5-turbo')).toThrow();
  });

  it('should enforce model blocklist', () => {
    const policy = makePolicy({
      agent: { models: { blocked_models: ['gpt-3.5-turbo'] } },
    });
    const enforcer = new PolicyEnforcer(policy);
    expect(() => enforcer.enforceModel('gpt-4o')).not.toThrow();
    expect(() => enforcer.enforceModel('gpt-3.5-turbo')).toThrow();
  });

  it('should enforce tool allowlist', () => {
    const policy = makePolicy({
      tools: {
        allowed_tools: [
          { name: 'web_search', description: 'Search tool' },
          { name: 'calculator', description: 'Math tool' },
        ],
      },
    });
    const enforcer = new PolicyEnforcer(policy);
    expect(() => enforcer.enforceTool('web_search')).not.toThrow();
    expect(() => enforcer.enforceTool('shell_exec')).toThrow();
  });

  it('should enforce network rules', () => {
    const policy = makePolicy({
      permissions: {
        network: {
          enabled: true,
          require_tls: true,
          allowed_domains: ['api.example.com'],
        },
      },
    });
    const enforcer = new PolicyEnforcer(policy);
    expect(() => enforcer.enforceNetwork('api.example.com', 'https')).not.toThrow();
    expect(() => enforcer.enforceNetwork('api.example.com', 'http')).toThrow();
    expect(() => enforcer.enforceNetwork('evil.com', 'https')).toThrow();
  });

  it('should operate in override/warn-only mode', () => {
    const policy = makePolicy({
      agent: { models: { allowed_models: ['gpt-4o'] } },
    });
    const enforcer = new PolicyEnforcer(policy, true);
    expect(() => enforcer.enforceModel('gpt-3.5-turbo')).not.toThrow();
  });
});

describe('Standalone: SDK Constructor', () => {
  it('should construct with just agentId and no env vars', () => {
    const sdk = new SekuireSDK({ agentId: 'test-agent-standalone' });
    expect(sdk.getLogger().getStatus().apiAvailable).toBe(false);
    sdk.getLogger().setEnabled(false);
  });
});

describe('Standalone: Logger Fallback', () => {
  it('should construct without apiBaseUrl and not crash', async () => {
    const logger = new SekuireLogger({
      sekuireId: 'test-id',
      fallback: 'silent',
    });
    expect(logger).toBeDefined();
    logger.logEvent('model_call', 'info', { message: 'test' });
    await logger.shutdown();
  });

  it('should write NDJSON to stdout in console fallback mode', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new SekuireLogger({
      sekuireId: 'test-id',
      fallback: 'console',
    });

    logger.logEvent('model_call', 'info', { message: 'standalone-test' });
    await logger.flush();

    const ndjsonCalls = writeSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('standalone-test')
    );
    expect(ndjsonCalls.length).toBeGreaterThan(0);

    const parsed = JSON.parse(ndjsonCalls[0][0] as string);
    expect(parsed.event_type).toBe('model_call');
    expect(parsed.event_data.message).toBe('standalone-test');

    writeSpy.mockRestore();
    await logger.shutdown();
  });

  it('should drop events in silent fallback mode', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const logger = new SekuireLogger({
      sekuireId: 'test-id',
      fallback: 'silent',
    });

    logger.logEvent('model_call', 'info', { message: 'should-be-silent' });
    await logger.flush();

    const ndjsonCalls = writeSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].includes('should-be-silent')
    );
    expect(ndjsonCalls.length).toBe(0);

    writeSpy.mockRestore();
    await logger.shutdown();
  });

  it('should report apiAvailable as false when no apiBaseUrl', async () => {
    const logger = new SekuireLogger({
      sekuireId: 'test-id',
      fallback: 'silent',
    });
    const status = logger.getStatus();
    expect(status.apiAvailable).toBe(false);
    expect(status.fallbackMode).toBe('silent');
    await logger.shutdown();
  });
});

describe('Standalone: Config Formats', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');

  it('should load .yml config', async () => {
    const config = await loadConfig(path.join(fixturesDir, 'sekuire.yml'));
    expect(config.project.name).toBe('TestAgent');
    expect(config.project.version).toBe('1.0.0');
    const agent = getAgentConfig(config);
    expect(agent.name).toBe('TestAgent');
    expect(agent.llm.model).toBe('gpt-4o');
  });

  it('should load .yaml config', async () => {
    const config = await loadConfig(path.join(fixturesDir, 'sekuire.yaml'));
    expect(config.project.name).toBe('TestAgent');
    const agent = getAgentConfig(config);
    expect(agent.name).toBe('TestAgent');
  });

  it('should load .json config via yaml parser', async () => {
    const config = await loadConfig(path.join(fixturesDir, 'sekuire.json'));
    expect(config.project.name).toBe('TestAgent');
    const agent = getAgentConfig(config);
    expect(agent.llm.provider).toBe('openai');
  });

  it('should produce identical output for .yml and .yaml', async () => {
    const ymlConfig = await loadConfig(path.join(fixturesDir, 'sekuire.yml'));
    const yamlConfig = await loadConfig(path.join(fixturesDir, 'sekuire.yaml'));
    expect(ymlConfig).toEqual(yamlConfig);
  });

  it('should produce identical output for .yml and .json', async () => {
    const ymlConfig = await loadConfig(path.join(fixturesDir, 'sekuire.yml'));
    const jsonConfig = await loadConfig(path.join(fixturesDir, 'sekuire.json'));
    expect(ymlConfig).toEqual(jsonConfig);
  });
});

describe('Standalone: Crypto Primitives', () => {
  it('should generate keypairs without network', () => {
    const kp = SekuireCrypto.generateKeyPair();
    expect(SekuireCrypto.isValidPublicKey(kp.publicKey)).toBe(true);
    expect(SekuireCrypto.isValidPrivateKey(kp.privateKey)).toBe(true);
  });

  it('should sign and verify without network', () => {
    const kp = SekuireCrypto.generateKeyPair();
    const sig = SekuireCrypto.sign('test message', kp.privateKey);
    expect(SekuireCrypto.verify('test message', sig, kp.publicKey)).toBe(true);
    expect(SekuireCrypto.verify('wrong message', sig, kp.publicKey)).toBe(false);
  });

  it('should hash deterministically without network', () => {
    const h1 = SekuireCrypto.hash('hello');
    const h2 = SekuireCrypto.hash('hello');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});
