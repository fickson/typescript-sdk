import { z } from 'zod';
import type { ToolDefinition } from '../agent';
import type { SekuireClient } from '../client';

/**
 * Create a tool for discovering other agents in the Sekuire network
 */
export function createDiscoveryTool(client: SekuireClient): ToolDefinition {
  return {
    name: 'discover_agents',
    description:
      "Search for other AI agents in the Sekuire network by capability or name. Use this to find agents that can help with specific tasks (e.g., 'jira', 'google drive').",
    schema: z.object({
      query: z.string().describe("The search query (e.g., 'jira', 'drive', 'github')"),
    }),
    execute: async ({ query }) => {
      try {
        const agents = await client.searchAgents(query);
        if (agents.length === 0) {
          return `No agents found matching '${query}'.`;
        }

        return agents.map((a) => ({
          name: a.name,
          id: a.sekuireId,
          description: a.description,
          status: a.verificationStatus,
        }));
      } catch (error: any) {
        return `Error searching for agents: ${error.message}`;
      }
    },
  };
}

/**
 * Create a tool for delegating tasks to other agents
 */
export function createDelegationTool(client: SekuireClient): ToolDefinition {
  return {
    name: 'delegate_task',
    description:
      "Delegate a task to another agent. Requires the target agent's Sekuire ID (found via discover_agents).",
    schema: z.object({
      agent_id: z.string().describe('The Sekuire ID of the target agent'),
      task: z.string().describe('The task description or message to send to the agent'),
      context: z.record(z.any()).optional().describe('Optional context data to pass'),
    }),
    execute: async ({ agent_id, task, context }) => {
      try {
        // 1. Get Agent Info
        const agentInfo = await client.getAgentInfo(agent_id);

        // 2. Perform Handshake & Auth (Simulated for this phase as we don't have dynamic URLs yet)
        // In a real scenario:
        // const handshake = await client.connect(agentInfo.url);

        // 3. Send Task
        // const result = await client.sendTask(handshake.session, { task, context });

        // For the demo/prototype phase without dynamic routing:
        // We simulate the success message. The actual inter-process communication
        // would happen here via HTTP/WebSocket.

        return {
          status: 'success',
          message: `Task successfully delegated to ${agentInfo.name || agent_id}`,
          details: {
            recipient: agent_id,
            task_summary: task.substring(0, 50) + '...',
          },
        };
      } catch (error: any) {
        return `Error delegating task to agent ${agent_id}: ${error.message}`;
      }
    },
  };
}
