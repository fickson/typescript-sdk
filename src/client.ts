import { SekuireCrypto } from "./crypto";
import { HttpClient } from "./http";
import {
    type AgentResponse,
    CryptoError,
    type HandshakeAuth,
    type HandshakeHello,
    type HandshakeResult,
    type HandshakeWelcome,
    type KeyPair,
    NetworkError,
    ProtocolError,
    type SekuireClientConfig,
} from "./types";

/**
 * Sekuire client for verifying agents and performing handshakes
 */
export class SekuireClient {
  private readonly httpClient: HttpClient;

  constructor(
    private readonly keyPair: KeyPair,
    config: SekuireClientConfig,
  ) {
    this.httpClient = new HttpClient({
      baseUrl: config.registryUrl,
      apiKey: config.apiKey,
      timeout: config.timeout,
      retries: config.retries,
    });
  }

  /**
   * Perform the full handshake with a remote agent
   */
  async connect(
    agentUrl: string,
    expectedAgentId?: string,
  ): Promise<HandshakeResult> {
    try {
      // 1. Generate client nonce
      const clientNonce = SekuireCrypto.generateNonce();

      // 2. Send HELLO
      const hello: HandshakeHello = { clientNonce };
      const welcome = await this.httpClient.post<HandshakeWelcome>(
        `${agentUrl}/sekuire/hello`,
        hello,
      );

      // 3. Verify agent ID if provided
      if (expectedAgentId && welcome.agentId !== expectedAgentId) {
        throw new ProtocolError(
          `Agent ID mismatch. Expected ${expectedAgentId}, got ${welcome.agentId}`,
        );
      }

      // 4. Verify signature C (Agent signed our nonce)
      await this.verifyAgentSignature(
        clientNonce,
        welcome.agentId,
        welcome.signatureC,
      );

      // 5. Sign agent nonce and send AUTH
      const signatureA = SekuireCrypto.sign(
        welcome.agentNonce,
        this.keyPair.privateKey,
      );
      const auth: HandshakeAuth = { signatureA };

      await this.httpClient.post(`${agentUrl}/sekuire/auth`, auth);

      return {
        agentId: welcome.agentId,
        verified: true,
        credentials: welcome.credentials,
      };
    } catch (error) {
      if (
        error instanceof NetworkError ||
        error instanceof ProtocolError ||
        error instanceof CryptoError
      ) {
        throw error;
      }
      throw new NetworkError(
        `Handshake failed: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Verify an agent's signature
   */
  private async verifyAgentSignature(
    clientNonce: string,
    agentId: string,
    signatureHex: string,
  ): Promise<void> {
    try {
      // Fetch agent's public key from registry
      const publicKey = await this.fetchAgentPublicKey(agentId);

      // Verify the signature
      const isValid = SekuireCrypto.verify(
        clientNonce,
        signatureHex,
        publicKey,
      );

      if (!isValid) {
        throw new CryptoError("Agent signature verification failed");
      }
    } catch (error) {
      if (error instanceof CryptoError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to verify agent signature: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Fetch agent's public key from the registry
   */
  async fetchAgentPublicKey(agentId: string): Promise<string> {
    try {
      const agentData = await this.httpClient.get<AgentResponse>(
        `/api/v1/agents/${agentId}`,
      );

      if (!agentData.authorKey) {
        throw new ProtocolError("Registry response missing authorKey");
      }

      if (!SekuireCrypto.isValidPublicKey(agentData.authorKey)) {
        throw new CryptoError("Invalid public key format from registry");
      }

      return agentData.authorKey;
    } catch (error) {
      if (error instanceof ProtocolError || error instanceof CryptoError) {
        throw error;
      }
      throw new NetworkError(
        `Registry lookup failed for ${agentId}`,
        error as Error,
      );
    }
  }

  /**
   * Get agent information from the registry
   */
  async getAgentInfo(agentId: string): Promise<AgentResponse> {
    try {
      return await this.httpClient.get<AgentResponse>(`/api/v1/agents/${agentId}`);
    } catch (error) {
      if (error instanceof ProtocolError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to fetch agent info: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Search for agents in the registry
   */
  async searchAgents(query: string): Promise<AgentResponse[]> {
    try {
      const response = await this.httpClient.get<{ agents: AgentResponse[] }>(
        `/api/v1/agents/search?q=${encodeURIComponent(query)}`,
      );
      return response.agents || [];
    } catch (error) {
      if (error instanceof ProtocolError) {
        throw error;
      }
      throw new NetworkError(
        `Failed to search agents: ${(error as Error).message}`,
        error as Error,
      );
    }
  }

  /**
   * Sign data with the client's private key
   */
  sign(data: string): string {
    return SekuireCrypto.sign(data, this.keyPair.privateKey);
  }

  /**
   * Get the client's public key
   */
  getPublicKey(): string {
    return this.keyPair.publicKey;
  }
}
