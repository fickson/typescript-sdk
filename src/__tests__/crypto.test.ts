import { describe, it, expect } from 'vitest';
import { SekuireCrypto } from '../crypto';

describe('SekuireCrypto', () => {
  describe('generateKeyPair', () => {
    it('should generate a valid keypair', () => {
      const keyPair = SekuireCrypto.generateKeyPair();

      expect(SekuireCrypto.isValidPrivateKey(keyPair.privateKey)).toBe(true);
      expect(SekuireCrypto.isValidPublicKey(keyPair.publicKey)).toBe(true);
      expect(keyPair.privateKey).toHaveLength(128); // 64 bytes = 128 hex chars
      expect(keyPair.publicKey).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should generate unique keypairs', () => {
      const keyPair1 = SekuireCrypto.generateKeyPair();
      const keyPair2 = SekuireCrypto.generateKeyPair();

      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });
  });

  describe('sign and verify', () => {
    it('should sign and verify messages correctly', () => {
      const keyPair = SekuireCrypto.generateKeyPair();
      const message = 'Hello, Sekuire!';

      const signature = SekuireCrypto.sign(message, keyPair.privateKey);
      const isValid = SekuireCrypto.verify(message, signature, keyPair.publicKey);

      expect(isValid).toBe(true);
      expect(SekuireCrypto.isValidHex(signature)).toBe(true);
    });

    it('should fail verification with wrong message', () => {
      const keyPair = SekuireCrypto.generateKeyPair();
      const message1 = 'Hello, Sekuire!';
      const message2 = 'Hello, World!';

      const signature = SekuireCrypto.sign(message1, keyPair.privateKey);
      const isValid = SekuireCrypto.verify(message2, signature, keyPair.publicKey);

      expect(isValid).toBe(false);
    });

    it('should fail verification with wrong public key', () => {
      const keyPair1 = SekuireCrypto.generateKeyPair();
      const keyPair2 = SekuireCrypto.generateKeyPair();
      const message = 'Hello, Sekuire!';

      const signature = SekuireCrypto.sign(message, keyPair1.privateKey);
      const isValid = SekuireCrypto.verify(message, signature, keyPair2.publicKey);

      expect(isValid).toBe(false);
    });
  });

  describe('hash', () => {
    it('should generate consistent hashes', () => {
      const data = 'Hello, Sekuire!';
      const hash1 = SekuireCrypto.hash(data);
      const hash2 = SekuireCrypto.hash(data);

      expect(hash1).toBe(hash2);
      expect(SekuireCrypto.isValidHex(hash1)).toBe(true);
      expect(hash1).toHaveLength(64); // Blake3 produces 32-byte hash = 64 hex chars
    });

    it('should generate different hashes for different data', () => {
      const hash1 = SekuireCrypto.hash('Hello');
      const hash2 = SekuireCrypto.hash('World');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('calculateSekuireId (V2 - canonical)', () => {
    it('should match CLI reference vector', () => {
      const id = SekuireCrypto.calculateSekuireId({
        model: 'gpt-4o',
        systemPrompt: 'You are a helpful assistant.',
        tools: '[]',
      });

      expect(id).toBe('28da5805f90c0b2d7437e448f40853092cc38f5fa223cae21994a8b76d338b53');
    });

    it('should produce deterministic output', () => {
      const params = { model: 'gpt-4', systemPrompt: 'You are a helpful assistant.', tools: '[]' };
      expect(SekuireCrypto.calculateSekuireId(params)).toBe(
        SekuireCrypto.calculateSekuireId(params)
      );
    });

    it('should ignore projectName and projectVersion', () => {
      const base = { model: 'gpt-4o', systemPrompt: 'test', tools: '[]' };
      const withProject = { ...base, projectName: 'A', projectVersion: '1.0' };
      expect(SekuireCrypto.calculateSekuireId(base)).toBe(
        SekuireCrypto.calculateSekuireId(withProject)
      );
    });

    it('should normalize JSON whitespace in tools', () => {
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

    it('should be insensitive to prompt leading/trailing whitespace', () => {
      const id1 = SekuireCrypto.calculateSekuireId({
        model: 'gpt-4o',
        systemPrompt: '  hello  ',
        tools: '[]',
      });
      const id2 = SekuireCrypto.calculateSekuireId({
        model: 'gpt-4o',
        systemPrompt: 'hello',
        tools: '[]',
      });
      expect(id1).toBe(id2);
    });

    it('should generate different IDs for different parameters', () => {
      const id1 = SekuireCrypto.calculateSekuireId({
        model: 'gpt-4',
        systemPrompt: 'You are a helpful assistant.',
        tools: '[]',
      });
      const id2 = SekuireCrypto.calculateSekuireId({
        model: 'gpt-4',
        systemPrompt: 'You are a different assistant.',
        tools: '[]',
      });
      expect(id1).not.toBe(id2);
    });

    it('V2 should differ from legacy for same core inputs', () => {
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
  });

  describe('calculateSekuireIdLegacy', () => {
    it('should produce deterministic output', () => {
      const params = {
        model: 'gpt-4',
        systemPrompt: 'You are a helpful assistant.',
        tools: '[]',
        projectName: 'MyAgent',
        projectVersion: '1.0.0',
      };
      expect(SekuireCrypto.calculateSekuireIdLegacy(params)).toBe(
        SekuireCrypto.calculateSekuireIdLegacy(params)
      );
    });
  });

  describe('generateNonce', () => {
    it('should generate valid nonces', () => {
      const nonce = SekuireCrypto.generateNonce();

      expect(SekuireCrypto.isValidNonce(nonce)).toBe(true);
      expect(nonce).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should generate unique nonces', () => {
      const nonce1 = SekuireCrypto.generateNonce();
      const nonce2 = SekuireCrypto.generateNonce();

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('utility functions', () => {
    it('should validate hex strings correctly', () => {
      expect(SekuireCrypto.isValidHex('0x123abc')).toBe(true);
      expect(SekuireCrypto.isValidHex('123abc')).toBe(true);
      expect(SekuireCrypto.isValidHex('')).toBe(false);
      expect(SekuireCrypto.isValidHex('xyz')).toBe(false);
      expect(SekuireCrypto.isValidHex('123')).toBe(false); // odd length
    });

    it('should validate public keys correctly', () => {
      expect(SekuireCrypto.isValidPublicKey('a'.repeat(64))).toBe(true);
      expect(SekuireCrypto.isValidPublicKey('a'.repeat(63))).toBe(false);
      expect(SekuireCrypto.isValidPublicKey('a'.repeat(65))).toBe(false);
    });

    it('should validate private keys correctly', () => {
      expect(SekuireCrypto.isValidPrivateKey('a'.repeat(128))).toBe(true);
      expect(SekuireCrypto.isValidPrivateKey('a'.repeat(127))).toBe(false);
      expect(SekuireCrypto.isValidPrivateKey('a'.repeat(129))).toBe(false);
    });

    it('should validate nonces correctly', () => {
      expect(SekuireCrypto.isValidNonce('a'.repeat(64))).toBe(true);
      expect(SekuireCrypto.isValidNonce('a'.repeat(63))).toBe(false);
      expect(SekuireCrypto.isValidNonce('a'.repeat(65))).toBe(false);
    });
  });
});
