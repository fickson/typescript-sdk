import { SekuireCrypto } from "./crypto";
import {
  CryptoError,
  type HandshakeAuthResult,
  type HandshakeAuth,
  type HandshakeHello,
  type HandshakeWelcome,
  type KeyPair,
  NetworkError,
  ProtocolError,
  type SignedRequestVerificationInput,
  type VerifiedRequestContext,
} from "./types";

/**
 * Base class for implementing Sekuire protocol servers
 */
export abstract class SekuireServer {
  private readonly pendingHandshakes = new Map<
    string,
    { agentNonce: string; createdAt: number }
  >();
  private readonly activeSessions = new Map<
    string,
    { clientPublicKey: string; createdAt: number; lastSeenAt: number }
  >();
  private static readonly HANDSHAKE_TTL_MS = 5 * 60 * 1000;
  private static readonly SESSION_TTL_MS = 60 * 60 * 1000;
  private static readonly REQUEST_CLOCK_SKEW_MS = 5 * 60 * 1000;

  constructor(
    protected readonly agentId: string,
    protected readonly keyPair: KeyPair,
  ) {}

  private purgeExpiredHandshakes(): void {
    const now = Date.now();
    for (const [clientNonce, pending] of this.pendingHandshakes) {
      if (now - pending.createdAt > SekuireServer.HANDSHAKE_TTL_MS) {
        this.pendingHandshakes.delete(clientNonce);
      }
    }
  }

  private purgeExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionToken, session] of this.activeSessions) {
      if (now - session.createdAt > SekuireServer.SESSION_TTL_MS) {
        this.activeSessions.delete(sessionToken);
      }
    }
  }

  private firstHeaderValue(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(Math.floor(value));
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(value) && value.length > 0) {
      return this.firstHeaderValue(value[0]);
    }
    return undefined;
  }

  private parseTimestamp(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new ProtocolError("Missing request timestamp");
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return Math.floor(numeric);
    }

    const parsedDate = Date.parse(trimmed);
    if (Number.isNaN(parsedDate)) {
      throw new ProtocolError("Invalid request timestamp");
    }
    return parsedDate;
  }

  private buildRequestSignatureMessage(
    method: string,
    path: string,
    timestampMs: number,
    body?: unknown,
  ): string {
    const normalizedBody =
      body === undefined ? "" : JSON.stringify(body);
    const bodyHash = SekuireCrypto.hash(normalizedBody);
    return `${method.toUpperCase()}\n${path}\n${timestampMs}\n${bodyHash}`;
  }

  /**
   * Handle the HELLO handshake message
   */
  async handleHello(hello: HandshakeHello): Promise<HandshakeWelcome> {
    try {
      // Validate client nonce
      if (!SekuireCrypto.isValidNonce(hello.clientNonce)) {
        throw new ProtocolError("Invalid client nonce format");
      }

      // Generate agent nonce
      const agentNonce = SekuireCrypto.generateNonce();
      this.purgeExpiredHandshakes();
      this.pendingHandshakes.set(hello.clientNonce, {
        agentNonce,
        createdAt: Date.now(),
      });

      // Sign the client nonce
      const signatureC = SekuireCrypto.sign(
        hello.clientNonce,
        this.keyPair.privateKey,
      );

      // Return welcome message
      return {
        agentId: this.agentId,
        agentNonce,
        signatureC,
        agentPublicKey: this.keyPair.publicKey,
        credentials: [], // TODO: Add verifiable credentials support
      };
    } catch (error) {
      if (error instanceof ProtocolError || error instanceof CryptoError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to handle HELLO: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Handle the AUTH handshake message
   */
  async handleAuth(
    auth: HandshakeAuth,
    clientNonce: string,
  ): Promise<HandshakeAuthResult> {
    try {
      if (!SekuireCrypto.isValidHex(auth.signatureA)) {
        throw new ProtocolError("Invalid signature format");
      }

      if (!SekuireCrypto.isValidNonce(clientNonce)) {
        throw new ProtocolError("Invalid client nonce format");
      }

      if (auth.clientNonce && auth.clientNonce !== clientNonce) {
        throw new ProtocolError("Client nonce mismatch");
      }

      if (!auth.clientPublicKey) {
        throw new ProtocolError("Missing client public key");
      }
      if (!SekuireCrypto.isValidPublicKey(auth.clientPublicKey)) {
        throw new ProtocolError("Invalid client public key format");
      }

      this.purgeExpiredHandshakes();
      const pending = this.pendingHandshakes.get(clientNonce);
      if (!pending) {
        throw new ProtocolError("Handshake not found or expired");
      }

      const verified = SekuireCrypto.verify(
        pending.agentNonce,
        auth.signatureA,
        auth.clientPublicKey,
      );
      if (!verified) {
        throw new ProtocolError("Client signature verification failed");
      }

      this.pendingHandshakes.delete(clientNonce);
      this.purgeExpiredSessions();

      const sessionToken = SekuireCrypto.generateNonce();
      const now = Date.now();
      this.activeSessions.set(sessionToken, {
        clientPublicKey: auth.clientPublicKey,
        createdAt: now,
        lastSeenAt: now,
      });

      return {
        success: true,
        sessionToken,
        expiresInSeconds: Math.floor(SekuireServer.SESSION_TTL_MS / 1000),
      };
    } catch (error) {
      if (error instanceof ProtocolError || error instanceof CryptoError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to handle AUTH: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Verify a signed request for protected application endpoints (for example /chat, /webhook, /a2a/tasks).
   * Requires a valid handshake session token and Ed25519 signature by the authenticated client key.
   */
  async verifySignedRequest(
    input: SignedRequestVerificationInput,
  ): Promise<VerifiedRequestContext> {
    try {
      const sessionToken = this.firstHeaderValue(input.sessionToken);
      const signature = this.firstHeaderValue(input.signature);
      const timestampRaw = this.firstHeaderValue(input.timestamp);

      if (!sessionToken) {
        throw new ProtocolError("Missing session token");
      }
      if (!signature) {
        throw new ProtocolError("Missing request signature");
      }
      if (!timestampRaw) {
        throw new ProtocolError("Missing request timestamp");
      }
      if (!SekuireCrypto.isValidHex(signature)) {
        throw new ProtocolError("Invalid signature format");
      }

      const timestampMs = this.parseTimestamp(timestampRaw);
      const now = Date.now();
      if (Math.abs(now - timestampMs) > SekuireServer.REQUEST_CLOCK_SKEW_MS) {
        throw new ProtocolError("Request timestamp is outside allowed skew");
      }

      this.purgeExpiredSessions();
      const session = this.activeSessions.get(sessionToken);
      if (!session) {
        throw new ProtocolError("Invalid or expired session token");
      }

      const message = this.buildRequestSignatureMessage(
        input.method,
        input.path,
        timestampMs,
        input.body,
      );
      const verified = SekuireCrypto.verify(
        message,
        signature,
        session.clientPublicKey,
      );
      if (!verified) {
        throw new ProtocolError("Request signature verification failed");
      }

      session.lastSeenAt = now;
      this.activeSessions.set(sessionToken, session);

      return {
        sessionToken,
        clientPublicKey: session.clientPublicKey,
        timestampMs,
      };
    } catch (error) {
      if (error instanceof ProtocolError || error instanceof CryptoError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to verify signed request: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Get the agent's public key
   */
  getPublicKey(): string {
    return this.keyPair.publicKey;
  }

  /**
   * Get the agent's ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Handle incoming webhooks from other agents
   */
  async handleWebhook(payload: any, signature?: string): Promise<any> {
    // In a real implementation, we would verify the signature
    // For now, we just pass the payload through to be handled by the implementation
    return { received: true };
  }
}

/**
 * Express.js middleware for Sekuire protocol
 */
export function createSekuireExpressMiddleware(server: SekuireServer) {
  const bodyParser = require("body-parser").json();

  return [
    bodyParser,
    async (req: any, res: any, next: any) => {
      try {
        if (req.path === "/sekuire/hello" && req.method === "POST") {
          const result = await server.handleHello(req.body);
          return res.json(result);
        } else if (req.path === "/sekuire/auth" && req.method === "POST") {
          const nonceFromBody = req.body?.clientNonce;
          const nonceFromHeader = req.headers["x-client-nonce"];
          const rawNonce = nonceFromBody ?? nonceFromHeader;
          const clientNonce = Array.isArray(rawNonce) ? rawNonce[0] : rawNonce;
          if (!clientNonce) {
            return res.status(400).json({ error: "Missing client nonce" });
          }

          const result = await server.handleAuth(req.body, clientNonce);
          return res.json(result);
        } else if (req.path === "/sekuire/webhook" && req.method === "POST") {
          const signature = req.headers["x-sekuire-signature"];
          const result = await server.handleWebhook(req.body, signature);
          return res.json(result);
        }

        next();
      } catch (error) {
        const statusCode = error instanceof ProtocolError ? 400 : 500;
        const message = (error as Error).message || "Internal server error";
        return res.status(statusCode).json({ error: message });
      }
    },
  ];
}

export interface RequestAuthOptions {
  protectedPaths?: string[];
}

function normalizeRequestPath(path: string): string {
  return path.split("?")[0] || path;
}

function isProtectedPath(path: string, protectedPaths: string[]): boolean {
  const normalized = normalizeRequestPath(path);
  return protectedPaths.includes(normalized);
}

/**
 * Express middleware that enforces signed-request authentication for protected paths.
 * Defaults to protecting POST /chat, POST /webhook, and POST /a2a/tasks.
 */
export function createSekuireExpressRequestAuthMiddleware(
  server: SekuireServer,
  options?: RequestAuthOptions,
) {
  const protectedPaths = options?.protectedPaths ?? ["/chat", "/webhook", "/a2a/tasks"];

  return async (req: any, res: any, next: any) => {
    if (
      req.method !== "POST" ||
      !isProtectedPath(req.path || req.url || "", protectedPaths)
    ) {
      return next();
    }

    try {
      await server.verifySignedRequest({
        method: req.method,
        path: req.path || req.url,
        body: req.body,
        sessionToken: req.headers["x-sekuire-session"],
        timestamp: req.headers["x-sekuire-timestamp"],
        signature: req.headers["x-sekuire-signature"],
      });
      return next();
    } catch (error) {
      return res.status(401).json({ error: (error as Error).message });
    }
  };
}

/**
 * Fastify plugin for Sekuire protocol
 */
export function createSekuireFastifyPlugin(server: SekuireServer) {
  return async (fastify: any, options: any) => {
    fastify.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (req: any, body: string, done: any) => {
        try {
          done(null, JSON.parse(body));
        } catch (err) {
          done(err);
        }
      },
    );

    fastify.post("/sekuire/hello", async (request: any, reply: any) => {
      try {
        const result = await server.handleHello(request.body);
        // Store client nonce for auth step (in real implementation, use session)
        reply.header("x-client-nonce", request.body.clientNonce);
        return result;
      } catch (error) {
        const statusCode = error instanceof ProtocolError ? 400 : 500;
        reply.code(statusCode);
        return { error: (error as Error).message };
      }
    });

    fastify.post("/sekuire/auth", async (request: any, reply: any) => {
      try {
        const nonceFromBody = request.body?.clientNonce;
        const nonceFromHeader = request.headers["x-client-nonce"];
        const rawNonce = nonceFromBody ?? nonceFromHeader;
        const clientNonce = Array.isArray(rawNonce) ? rawNonce[0] : rawNonce;
        if (!clientNonce) {
          reply.code(400);
          return { error: "Missing client nonce" };
        }

        const result = await server.handleAuth(request.body, clientNonce);
        return result;
      } catch (error) {
        const statusCode = error instanceof ProtocolError ? 400 : 500;
        reply.code(statusCode);
        return { error: (error as Error).message };
      }
    });

    fastify.post("/sekuire/webhook", async (request: any, reply: any) => {
      try {
        const signature = request.headers["x-sekuire-signature"];
        const result = await server.handleWebhook(request.body, signature);
        return result;
      } catch (error) {
        reply.code(500);
        return { error: (error as Error).message };
      }
    });
  };
}

/**
 * Fastify preHandler that enforces signed-request authentication for protected paths.
 * Defaults to protecting POST /chat, POST /webhook, and POST /a2a/tasks.
 */
export function createSekuireFastifyRequestAuthHook(
  server: SekuireServer,
  options?: RequestAuthOptions,
) {
  const protectedPaths = options?.protectedPaths ?? ["/chat", "/webhook", "/a2a/tasks"];

  return async (request: any, reply: any) => {
    if (
      request.method !== "POST" ||
      !isProtectedPath(request.url || "", protectedPaths)
    ) {
      return;
    }

    try {
      await server.verifySignedRequest({
        method: request.method,
        path: normalizeRequestPath(request.url || ""),
        body: request.body,
        sessionToken: request.headers["x-sekuire-session"],
        timestamp: request.headers["x-sekuire-timestamp"],
        signature: request.headers["x-sekuire-signature"],
      });
    } catch (error) {
      reply.code(401);
      reply.send({ error: (error as Error).message });
      return;
    }
  };
}
