import { type HandshakeAuthResult, type HandshakeAuth, type HandshakeHello, type HandshakeWelcome, type KeyPair, type SignedRequestVerificationInput, type VerifiedRequestContext } from "./types";
/**
 * Base class for implementing Sekuire protocol servers
 */
export declare abstract class SekuireServer {
    protected readonly agentId: string;
    protected readonly keyPair: KeyPair;
    private readonly pendingHandshakes;
    private readonly activeSessions;
    private static readonly HANDSHAKE_TTL_MS;
    private static readonly SESSION_TTL_MS;
    private static readonly REQUEST_CLOCK_SKEW_MS;
    constructor(agentId: string, keyPair: KeyPair);
    private purgeExpiredHandshakes;
    private purgeExpiredSessions;
    private firstHeaderValue;
    private parseTimestamp;
    private buildRequestSignatureMessage;
    /**
     * Handle the HELLO handshake message
     */
    handleHello(hello: HandshakeHello): Promise<HandshakeWelcome>;
    /**
     * Handle the AUTH handshake message
     */
    handleAuth(auth: HandshakeAuth, clientNonce: string): Promise<HandshakeAuthResult>;
    /**
     * Verify a signed request for protected application endpoints (for example /chat, /webhook).
     * Requires a valid handshake session token and Ed25519 signature by the authenticated client key.
     */
    verifySignedRequest(input: SignedRequestVerificationInput): Promise<VerifiedRequestContext>;
    /**
     * Get the agent's public key
     */
    getPublicKey(): string;
    /**
     * Get the agent's ID
     */
    getAgentId(): string;
    /**
     * Handle incoming webhooks from other agents
     */
    handleWebhook(payload: any, signature?: string): Promise<any>;
}
/**
 * Express.js middleware for Sekuire protocol
 */
export declare function createSekuireExpressMiddleware(server: SekuireServer): any[];
export interface RequestAuthOptions {
    protectedPaths?: string[];
}
/**
 * Express middleware that enforces signed-request authentication for protected paths.
 * Defaults to protecting POST /chat and POST /webhook.
 */
export declare function createSekuireExpressRequestAuthMiddleware(server: SekuireServer, options?: RequestAuthOptions): (req: any, res: any, next: any) => Promise<any>;
/**
 * Fastify plugin for Sekuire protocol
 */
export declare function createSekuireFastifyPlugin(server: SekuireServer): (fastify: any, options: any) => Promise<void>;
/**
 * Fastify preHandler that enforces signed-request authentication for protected paths.
 * Defaults to protecting POST /chat and POST /webhook.
 */
export declare function createSekuireFastifyRequestAuthHook(server: SekuireServer, options?: RequestAuthOptions): (request: any, reply: any) => Promise<void>;
