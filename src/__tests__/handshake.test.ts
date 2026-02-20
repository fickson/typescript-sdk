import { afterEach, describe, expect, it, vi } from 'vitest';
import { SekuireClient } from '../client';
import { SekuireCrypto } from '../crypto';
import { SekuireServer } from '../server';
import { ProtocolError, type HandshakeWelcome, type KeyPair } from '../types';

class TestServer extends SekuireServer {}

const ORIGINAL_FETCH = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Handshake verification', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('verifies client signature during AUTH using client public key', async () => {
    const agentKeyPair = SekuireCrypto.generateKeyPair();
    const clientKeyPair = SekuireCrypto.generateKeyPair();
    const server = new TestServer('agent-test', agentKeyPair);

    const clientNonce = SekuireCrypto.generateNonce();
    const welcome = await server.handleHello({ clientNonce });

    const signatureA = SekuireCrypto.sign(welcome.agentNonce, clientKeyPair.privateKey);

    await expect(
      server.handleAuth(
        {
          signatureA,
          clientPublicKey: clientKeyPair.publicKey,
          clientNonce,
        },
        clientNonce
      )
    ).resolves.toMatchObject({
      success: true,
      sessionToken: expect.any(String),
      expiresInSeconds: expect.any(Number),
    });
  });

  it('rejects AUTH when signature does not match agent nonce', async () => {
    const agentKeyPair = SekuireCrypto.generateKeyPair();
    const clientKeyPair = SekuireCrypto.generateKeyPair();
    const server = new TestServer('agent-test', agentKeyPair);

    const clientNonce = SekuireCrypto.generateNonce();
    await server.handleHello({ clientNonce });

    const badSignatureA = SekuireCrypto.sign(
      SekuireCrypto.generateNonce(),
      clientKeyPair.privateKey
    );

    await expect(
      server.handleAuth(
        {
          signatureA: badSignatureA,
          clientPublicKey: clientKeyPair.publicKey,
          clientNonce,
        },
        clientNonce
      )
    ).rejects.toThrow('Client signature verification failed');
  });

  it('rejects AUTH if no pending HELLO exists', async () => {
    const agentKeyPair = SekuireCrypto.generateKeyPair();
    const clientKeyPair = SekuireCrypto.generateKeyPair();
    const server = new TestServer('agent-test', agentKeyPair);
    const clientNonce = SekuireCrypto.generateNonce();

    const signatureA = SekuireCrypto.sign(SekuireCrypto.generateNonce(), clientKeyPair.privateKey);

    await expect(
      server.handleAuth(
        {
          signatureA,
          clientPublicKey: clientKeyPair.publicKey,
          clientNonce,
        },
        clientNonce
      )
    ).rejects.toThrow('Handshake not found or expired');
  });

  it('client connect succeeds offline using handshake-provided agent public key', async () => {
    const agentKeyPair = SekuireCrypto.generateKeyPair();
    const clientKeyPair = SekuireCrypto.generateKeyPair();

    let lastWelcome: HandshakeWelcome | null = null;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/sekuire/hello')) {
        const payload = JSON.parse((init?.body as string) || '{}');
        const welcome: HandshakeWelcome = {
          agentId: 'agent-local',
          agentNonce: SekuireCrypto.generateNonce(),
          signatureC: SekuireCrypto.sign(payload.clientNonce, agentKeyPair.privateKey),
          agentPublicKey: agentKeyPair.publicKey,
          credentials: [],
        };
        lastWelcome = welcome;
        return jsonResponse(200, welcome);
      }

      if (url.endsWith('/sekuire/auth')) {
        const payload = JSON.parse((init?.body as string) || '{}');
        expect(payload.clientPublicKey).toBe(clientKeyPair.publicKey);
        expect(typeof payload.clientNonce).toBe('string');
        expect(lastWelcome).not.toBeNull();
        const isValid = SekuireCrypto.verify(
          lastWelcome!.agentNonce,
          payload.signatureA,
          payload.clientPublicKey
        );
        expect(isValid).toBe(true);
        return jsonResponse(200, {
          success: true,
          sessionToken: SekuireCrypto.generateNonce(),
          expiresInSeconds: 3600,
        });
      }

      if (url.includes('/api/v1/agents/')) {
        throw new Error('Registry lookup should not be required for offline handshake');
      }

      return jsonResponse(404, { error: 'not found' });
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = new SekuireClient(clientKeyPair, {
      registryUrl: 'http://registry.local',
    });

    const result = await client.connect('http://agent.local', 'agent-local');
    expect(result.verified).toBe(true);
    expect(result.agentId).toBe('agent-local');
    expect(result.sessionToken).toBeDefined();
    expect(client.getSessionToken()).toBe(result.sessionToken);
  });

  it('rejects AUTH when client nonce payload mismatches header nonce', async () => {
    const agentKeyPair = SekuireCrypto.generateKeyPair();
    const clientKeyPair = SekuireCrypto.generateKeyPair();
    const server = new TestServer('agent-test', agentKeyPair);

    const realClientNonce = SekuireCrypto.generateNonce();
    const wrongClientNonce = SekuireCrypto.generateNonce();
    const welcome = await server.handleHello({ clientNonce: realClientNonce });

    const signatureA = SekuireCrypto.sign(welcome.agentNonce, clientKeyPair.privateKey);

    await expect(
      server.handleAuth(
        {
          signatureA,
          clientPublicKey: clientKeyPair.publicKey,
          clientNonce: wrongClientNonce,
        },
        realClientNonce
      )
    ).rejects.toThrow(ProtocolError);
  });

  it('verifies signed endpoint requests using handshake session', async () => {
    const agentKeyPair = SekuireCrypto.generateKeyPair();
    const clientKeyPair = SekuireCrypto.generateKeyPair();
    const server = new TestServer('agent-test', agentKeyPair);
    const client = new SekuireClient(clientKeyPair, {
      registryUrl: 'http://registry.local',
    });

    const clientNonce = SekuireCrypto.generateNonce();
    const welcome = await server.handleHello({ clientNonce });
    const signatureA = SekuireCrypto.sign(welcome.agentNonce, clientKeyPair.privateKey);
    const authResult = await server.handleAuth(
      {
        signatureA,
        clientPublicKey: clientKeyPair.publicKey,
        clientNonce,
      },
      clientNonce
    );

    (client as any).sessionToken = authResult.sessionToken;
    const payload = { message: 'hello' };
    const headers = client.createSignedRequestHeaders('POST', '/chat', payload);

    await expect(
      server.verifySignedRequest({
        method: 'POST',
        path: '/chat',
        body: payload,
        sessionToken: headers['x-sekuire-session'],
        timestamp: headers['x-sekuire-timestamp'],
        signature: headers['x-sekuire-signature'],
      })
    ).resolves.toMatchObject({
      sessionToken: authResult.sessionToken,
      clientPublicKey: clientKeyPair.publicKey,
    });
  });
});
