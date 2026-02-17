import { Tool, type ToolInput, type ToolMetadata } from './base';

/**
 * Agent Discovery Tool - Find other agents by capability
 */
export class AgentDiscoveryTool extends Tool {
  metadata: ToolMetadata = {
    name: 'agent_discovery',
    description:
      'Discover other agents in the workspace/organization by capability, tag, or category',
    parameters: [
      {
        name: 'capability',
        type: 'string',
        description: 'Capability to search for (e.g., "github:repository_management")',
        required: false,
      },
      {
        name: 'tag',
        type: 'string',
        description: 'Tag to filter by (e.g., "code-analysis")',
        required: false,
      },
      {
        name: 'category',
        type: 'string',
        description: 'Category to filter by (e.g., "developer-tools")',
        required: false,
      },
      {
        name: 'verified_only',
        type: 'boolean',
        description: 'Only return verified agents',
        required: false,
        default: false,
      },
      {
        name: 'scope',
        type: 'string',
        description: 'Search scope (workspace or organization)',
        required: false,
        default: 'workspace',
      },
    ],
    category: 'agent-orchestration',
  };

  async execute(input: ToolInput): Promise<string> {
    const {
      capability,
      tag,
      category,
      verified_only = false,
      scope = 'workspace',
    } = input as {
      capability?: string;
      tag?: string;
      category?: string;
      verified_only?: boolean;
      scope?: string;
    };
    try {
      const workspaceId = process.env.SEKUIRE_WORKSPACE_ID;
      const orgId = process.env.SEKUIRE_ORG_ID;

      if (!workspaceId && !orgId) {
        throw new Error('Workspace ID or Org ID not configured for agent discovery');
      }

      // Build query parameters
      const queryParams = new URLSearchParams();
      if (capability) queryParams.append('capability', String(capability));
      if (tag) queryParams.append('tag', String(tag));
      if (category) queryParams.append('category', String(category));
      if (verified_only) queryParams.append('verified', 'true');

      const endpoint =
        scope === 'workspace'
          ? `/api/v1/workspaces/${workspaceId}/agents/available`
          : `/api/v1/organizations/${orgId}/agents/available`;

      const apiUrl = process.env.SEKUIRE_API_URL || 'https://api.sekuire.com';
      const url = `${apiUrl}${endpoint}?${queryParams.toString()}`;

      const authToken = process.env.SEKUIRE_AUTH_TOKEN || '';
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Agent discovery failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Format response
      if (data.agents.length === 0) {
        return 'No agents found matching the criteria.';
      }

      const agentList = data.agents
        .map(
          (agent: any) =>
            `- ${agent.name} (${agent.sekuire_id}): ${agent.description || 'No description'}\n  Capabilities: ${agent.capabilities?.provides?.join(', ') || 'None listed'}`
        )
        .join('\n');

      return `Found ${data.agents.length} agent(s):\n\n${agentList}`;
    } catch (error) {
      return `❌ Agent discovery failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * Agent Delegation Tool - Delegate tasks to other agents
 */
export class AgentDelegationTool extends Tool {
  metadata: ToolMetadata = {
    name: 'delegate_to_agent',
    description:
      'Delegate a task to another agent in the workspace. Use this when another agent has specific capabilities you need.',
    parameters: [
      {
        name: 'target_agent_id',
        type: 'string',
        description: 'Sekuire ID of the target agent to delegate to',
        required: false,
      },
      {
        name: 'capability',
        type: 'string',
        description:
          'Required capability (alternative to target_agent_id - will find best agent with this capability)',
        required: false,
      },
      {
        name: 'task',
        type: 'object',
        description: 'Task specification to send to the agent',
        required: true,
      },
      {
        name: 'timeout_seconds',
        type: 'number',
        description: 'Maximum time to wait for response',
        required: false,
        default: 30,
      },
    ],
    category: 'agent-orchestration',
  };

  async execute(input: ToolInput): Promise<string> {
    const {
      target_agent_id,
      capability,
      task,
      timeout_seconds = 30,
    } = input as {
      target_agent_id?: string;
      capability?: string;
      task: any;
      timeout_seconds?: number;
    };
    try {
      let targetId = target_agent_id;
      let upstreamUrl: string | null = null;

      const agentId = process.env.SEKUIRE_AGENT_ID || 'unknown';
      const workspaceId = process.env.SEKUIRE_WORKSPACE_ID;
      const authToken = process.env.SEKUIRE_AUTH_TOKEN || '';
      const apiUrl = process.env.SEKUIRE_API_URL || 'https://api.sekuire.com';

      if (!targetId && capability) {
        const queryParams = new URLSearchParams({ capability: String(capability) });
        const discoveryUrl = `${apiUrl}/api/v1/discovery?${queryParams.toString()}`;

        const discoveryResp = await fetch(discoveryUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'X-Workspace-Id': workspaceId || '',
          },
        });

        if (discoveryResp.ok) {
          const discoveryData = await discoveryResp.json();
          if (discoveryData.agents && discoveryData.agents.length > 0) {
            const agent = discoveryData.agents[0];
            targetId = agent.sekuire_id || agent.agent_id;
            upstreamUrl = agent.upstream_url || null;
          }
        }

        if (!targetId) {
          return `❌ No agent found with capability: ${capability}`;
        }
      }

      if (!targetId) {
        throw new Error('Must provide either target_agent_id or capability');
      }

      const delegationRequest = {
        delegation_id: `del_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from_agent: agentId,
        to_agent: targetId,
        task,
        context: {
          workspace_id: workspaceId,
          original_request_id: `req_${Date.now()}`,
          delegation_chain: [],
        },
        authorization: {
          token: authToken,
        },
      };

      const headers = {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'X-Workspace-Id': workspaceId || '',
        'X-Delegation-Chain': JSON.stringify([agentId]),
        'X-Context-Id': delegationRequest.context.original_request_id,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), Number(timeout_seconds) * 1000);

      let response: Response | null = null;
      let usedProxy = false;

      if (upstreamUrl) {
        try {
          const directUrl = `${upstreamUrl.replace(/\/$/, '')}/a2a/tasks`;
          response = await fetch(directUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(delegationRequest),
            signal: controller.signal,
          });
        } catch {
          response = null;
        }
      }

      if (!response || !response.ok) {
        usedProxy = true;
        const proxyUrl = `${apiUrl}/a2a/${targetId}/tasks`;
        response = await fetch(proxyUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(delegationRequest),
          signal: controller.signal,
        });
      }

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = (errorBody as { reason?: string }).reason || response.statusText;
        throw new Error(`Delegation failed: ${reason}`);
      }

      const result = await response.json();
      const routeInfo = usedProxy ? '(via proxy)' : '(direct)';

      return `✅ Task delegated to agent ${targetId} ${routeInfo}\n\nResult:\n${JSON.stringify(result.result || result, null, 2)}\n\nExecution time: ${result.execution_time_ms || 'N/A'}ms`;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return `❌ Delegation timeout after ${timeout_seconds || 30} seconds`;
      }
      return `❌ Delegation failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * Agent Status Check Tool - Check if an agent is available
 */
export class AgentStatusTool extends Tool {
  metadata: ToolMetadata = {
    name: 'check_agent_status',
    description: 'Check if another agent is online and available to accept tasks',
    parameters: [
      {
        name: 'agent_id',
        type: 'string',
        description: 'Sekuire ID of the agent to check',
        required: true,
      },
    ],
    category: 'agent-orchestration',
  };

  async execute(input: ToolInput): Promise<string> {
    try {
      const { agent_id } = input as { agent_id: string };

      const apiUrl = process.env.SEKUIRE_API_URL || 'https://api.sekuire.com';
      const url = `${apiUrl}/api/v1/agents/${agent_id}/status`;
      const authToken = process.env.SEKUIRE_AUTH_TOKEN || '';

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return `❌ Agent ${agent_id} not found`;
        }
        throw new Error(`Status check failed: ${response.statusText}`);
      }

      const status = await response.json();

      return `Agent ${agent_id} status:
- Status: ${status.status}
- Available: ${status.available ? 'Yes' : 'No'}
- Load: ${status.current_load || 0}/${status.max_load || 100}
- Uptime: ${status.uptime_seconds || 0}s
- Last seen: ${status.last_seen || 'Unknown'}`;
    } catch (error) {
      return `❌ Status check failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
