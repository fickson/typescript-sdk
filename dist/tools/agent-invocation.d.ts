import { Tool, ToolInput, ToolMetadata } from './base';
/**
 * Tool for invoking other Sekuire agents
 * Performs handshake and sends requests to verified agents
 */
export declare class InvokeAgentTool extends Tool {
    metadata: ToolMetadata;
    private client;
    private readonly privateKey?;
    private readonly publicKey?;
    private readonly registryUrl;
    constructor(privateKey?: string, publicKey?: string, registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
}
/**
 * Tool for searching the Sekuire registry for agents
 */
export declare class SearchAgentsTool extends Tool {
    metadata: ToolMetadata;
    private client;
    private readonly privateKey?;
    private readonly publicKey?;
    private readonly registryUrl;
    constructor(privateKey?: string, publicKey?: string, registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
}
/**
 * Tool for getting detailed information about a specific agent
 */
export declare class GetAgentInfoTool extends Tool {
    metadata: ToolMetadata;
    private client;
    private readonly privateKey?;
    private readonly publicKey?;
    private readonly registryUrl;
    constructor(privateKey?: string, publicKey?: string, registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
}
