import { SekuireCrypto } from "./crypto";
import {
  CryptoError,
  type HandshakeAuth,
  type HandshakeHello,
  type HandshakeWelcome,
  type KeyPair,
  NetworkError,
  ProtocolError,
} from "./types";

/**
 * Base class for implementing Sekuire protocol servers
 */
export abstract class SekuireServer {
  constructor(
    protected readonly agentId: string,
    protected readonly keyPair: KeyPair,
  ) {}

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
  async handleAuth(auth: HandshakeAuth, clientNonce: string): Promise<void> {
    try {
      // In a real implementation, we would:
      // 1. Extract client public key from some registry or JWT
      // 2. Verify the signature of agentNonce
      // 3. Complete mutual authentication

      // For now, just validate the signature format
      if (!SekuireCrypto.isValidHex(auth.signatureA)) {
        throw new ProtocolError("Invalid signature format");
      }

      // TODO: Implement full client verification
      // This would involve looking up the client's public key
      // and verifying they signed our agent nonce correctly
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
          // Store client nonce from previous step (in real implementation, use session/storage)
          const clientNonce = req.headers["x-client-nonce"];
          if (!clientNonce) {
            return res.status(400).json({ error: "Missing client nonce" });
          }

          await server.handleAuth(req.body, clientNonce);
          return res.json({ success: true });
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
        const clientNonce = request.headers["x-client-nonce"];
        if (!clientNonce) {
          reply.code(400);
          return { error: "Missing client nonce" };
        }

        await server.handleAuth(request.body, clientNonce);
        return { success: true };
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
