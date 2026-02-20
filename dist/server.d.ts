import { type HandshakeAuth, type HandshakeHello, type HandshakeWelcome, type KeyPair } from "./types";
/**
 * Base class for implementing Sekuire protocol servers
 */
export declare abstract class SekuireServer {
    protected readonly agentId: string;
    protected readonly keyPair: KeyPair;
    private readonly pendingHandshakes;
    private static readonly HANDSHAKE_TTL_MS;
    constructor(agentId: string, keyPair: KeyPair);
    private purgeExpiredHandshakes;
    /**
     * Handle the HELLO handshake message
     */
    handleHello(hello: HandshakeHello): Promise<HandshakeWelcome>;
    /**
     * Handle the AUTH handshake message
     */
    handleAuth(auth: HandshakeAuth, clientNonce: string): Promise<void>;
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
/**
 * Fastify plugin for Sekuire protocol
 */
export declare function createSekuireFastifyPlugin(server: SekuireServer): (fastify: any, options: any) => Promise<void>;
