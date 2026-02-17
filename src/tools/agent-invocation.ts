import { SekuireClient } from '../client';
import { SekuireCrypto } from '../crypto';
import { Tool, ToolInput, ToolMetadata } from './base';

/**
 * Tool for invoking other Sekuire agents
 * Performs handshake and sends requests to verified agents
 */
export class InvokeAgentTool extends Tool {
  metadata: ToolMetadata = {
    name: 'invoke_agent',
    description:
      'Invoke another Sekuire agent by performing a secure handshake and sending a request. Use this to delegate tasks to specialized agents.',
    parameters: [
      {
        name: 'agent_url',
        type: 'string',
        description: 'The base URL of the agent to invoke (e.g., https://agent.example.com)',
        required: true,
      },
      {
        name: 'agent_id',
        type: 'string',
        description: 'Optional: The expected agent ID for verification',
        required: false,
      },
      {
        name: 'request',
        type: 'string',
        description: 'The request/query to send to the agent',
        required: true,
      },
      {
        name: 'parameters',
        type: 'object',
        description: 'Optional: Additional parameters to pass to the agent',
        required: false,
      },
    ],
    category: 'agent_communication',
  };

  private client: SekuireClient | null = null;
  private readonly privateKey?: string;
  private readonly publicKey?: string;
  private readonly registryUrl: string;

  constructor(
    privateKey?: string,
    publicKey?: string,
    registryUrl: string = 'https://api.sekuire.com'
  ) {
    super();
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.registryUrl = registryUrl;
  }

  async execute(input: ToolInput): Promise<string> {
    const agent_url = input.agent_url as string;
    const agent_id = input.agent_id as string | undefined;
    const request = input.request as string;
    const parameters = input.parameters as Record<string, unknown> | undefined;

    if (!this.privateKey || !this.publicKey) {
      return JSON.stringify({
        success: false,
        error: "Agent invocation requires keypair. Run 'sekuire keygen' first.",
      });
    }

    try {
      // Initialize client if not already done
      if (!this.client) {
        this.client = new SekuireClient(
          { privateKey: this.privateKey, publicKey: this.publicKey },
          { registryUrl: this.registryUrl }
        );
      }

      // Perform handshake with target agent
      const handshakeResult = await this.client.connect(agent_url, agent_id);

      if (!handshakeResult.verified) {
        return JSON.stringify({
          success: false,
          error: 'Failed to verify agent identity during handshake',
          agent_id: handshakeResult.agentId,
        });
      }

      // Send request to the agent
      const response = await fetch(`${agent_url}/agent/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sekuire-Agent-Id': handshakeResult.agentId,
        },
        body: JSON.stringify({
          request,
          parameters: parameters || {},
          credentials: handshakeResult.credentials,
        }),
      });

      if (!response.ok) {
        return JSON.stringify({
          success: false,
          error: `Agent returned error: ${response.status} ${response.statusText}`,
          agent_id: handshakeResult.agentId,
        });
      }

      const result = await response.json();

      return JSON.stringify({
        success: true,
        agent_id: handshakeResult.agentId,
        verified: handshakeResult.verified,
        response: result,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

/**
 * Tool for searching the Sekuire registry for agents
 */
export class SearchAgentsTool extends Tool {
  metadata: ToolMetadata = {
    name: 'search_agents',
    description:
      'Search the Sekuire registry for agents by name, capability, or description. Returns a list of verified agents.',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'Search query (agent name, capability, or description)',
        required: true,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
        required: false,
      },
    ],
    category: 'agent_communication',
  };

  private client: SekuireClient | null = null;
  private readonly privateKey?: string;
  private readonly publicKey?: string;
  private readonly registryUrl: string;

  constructor(
    privateKey?: string,
    publicKey?: string,
    registryUrl: string = 'https://api.sekuire.com'
  ) {
    super();
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.registryUrl = registryUrl;
  }

  async execute(input: ToolInput): Promise<string> {
    const query = input.query as string;
    const limit = (input.limit as number) || 10;

    try {
      // Initialize client if not already done
      if (!this.client) {
        if (!this.privateKey || !this.publicKey) {
          // Create temporary keypair for registry access
          const tempKeyPair = SekuireCrypto.generateKeyPair();
          this.client = new SekuireClient(tempKeyPair, {
            registryUrl: this.registryUrl,
          });
        } else {
          this.client = new SekuireClient(
            { privateKey: this.privateKey, publicKey: this.publicKey },
            { registryUrl: this.registryUrl }
          );
        }
      }

      const agents = await this.client.searchAgents(query);
      const limitedAgents = agents.slice(0, limit);

      return JSON.stringify({
        success: true,
        count: limitedAgents.length,
        agents: limitedAgents.map((agent) => ({
          id: agent.sekuireId,
          name: agent.name,
          description: agent.description,
          verification_status: agent.verificationStatus,
        })),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        agents: [],
      });
    }
  }
}

/**
 * Tool for getting detailed information about a specific agent
 */
export class GetAgentInfoTool extends Tool {
  metadata: ToolMetadata = {
    name: 'get_agent_info',
    description:
      'Get detailed information about a specific Sekuire agent including its verification status, capabilities, and public key.',
    parameters: [
      {
        name: 'agent_id',
        type: 'string',
        description: 'The unique identifier of the agent',
        required: true,
      },
    ],
    category: 'agent_communication',
  };

  private client: SekuireClient | null = null;
  private readonly privateKey?: string;
  private readonly publicKey?: string;
  private readonly registryUrl: string;

  constructor(
    privateKey?: string,
    publicKey?: string,
    registryUrl: string = 'https://api.sekuire.com'
  ) {
    super();
    this.privateKey = privateKey;
    this.publicKey = publicKey;
    this.registryUrl = registryUrl;
  }

  async execute(input: ToolInput): Promise<string> {
    const agent_id = input.agent_id as string;

    try {
      // Initialize client if not already done
      if (!this.client) {
        if (!this.privateKey || !this.publicKey) {
          // Create temporary keypair for registry access
          const tempKeyPair = SekuireCrypto.generateKeyPair();
          this.client = new SekuireClient(tempKeyPair, {
            registryUrl: this.registryUrl,
          });
        } else {
          this.client = new SekuireClient(
            { privateKey: this.privateKey, publicKey: this.publicKey },
            { registryUrl: this.registryUrl }
          );
        }
      }

      const agent = await this.client.getAgentInfo(agent_id);

      return JSON.stringify({
        success: true,
        agent: {
          id: agent.sekuireId,
          name: agent.name,
          description: agent.description,
          author_key: agent.authorKey,
          verification_status: agent.verificationStatus,
          created_at: agent.createdAt,
        },
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
