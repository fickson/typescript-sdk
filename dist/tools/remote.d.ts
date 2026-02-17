import type { ToolDefinition } from '../agent';
import type { SekuireClient } from '../client';
/**
 * Create a tool for discovering other agents in the Sekuire network
 */
export declare function createDiscoveryTool(client: SekuireClient): ToolDefinition;
/**
 * Create a tool for delegating tasks to other agents
 */
export declare function createDelegationTool(client: SekuireClient): ToolDefinition;
