import { type AgentResponse, type HandshakeResult, type KeyPair, type SekuireClientConfig } from "./types";
/**
 * Sekuire client for verifying agents and performing handshakes
 */
export declare class SekuireClient {
    private readonly keyPair;
    private readonly httpClient;
    private sessionToken?;
    constructor(keyPair: KeyPair, config: SekuireClientConfig);
    /**
     * Perform the full handshake with a remote agent
     */
    connect(agentUrl: string, expectedAgentId?: string): Promise<HandshakeResult>;
    /**
     * Verify an agent's signature
     */
    private verifyAgentSignature;
    /**
     * Fetch agent's public key from the registry
     */
    fetchAgentPublicKey(agentId: string): Promise<string>;
    /**
     * Get agent information from the registry
     */
    getAgentInfo(agentId: string): Promise<AgentResponse>;
    /**
     * Search for agents in the registry
     */
    searchAgents(query: string): Promise<AgentResponse[]>;
    /**
     * Sign data with the client's private key
     */
    sign(data: string): string;
    private buildRequestSignatureMessage;
    /**
     * Build signed headers for protected agent endpoints (for example /chat, /webhook).
     * Requires a successful connect() call to obtain a session token.
     */
    createSignedRequestHeaders(method: string, path: string, body?: unknown, timestampMs?: number): Record<string, string>;
    /**
     * Get the current authenticated session token, if any.
     */
    getSessionToken(): string | undefined;
    /**
     * Clear the local session token.
     */
    clearSession(): void;
    /**
     * Get the client's public key
     */
    getPublicKey(): string;
}
