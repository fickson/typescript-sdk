import { Tool, type ToolInput, type ToolMetadata } from './base';
/**
 * Agent Discovery Tool - Find other agents by capability
 */
export declare class AgentDiscoveryTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
/**
 * Agent Delegation Tool - Delegate tasks to other agents
 */
export declare class AgentDelegationTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
/**
 * Agent Status Check Tool - Check if an agent is available
 */
export declare class AgentStatusTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
