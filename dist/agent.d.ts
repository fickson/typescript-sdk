/**
 * Sekuire Agent Framework
 *
 * High-level API for building compliant AI agents with automatic
 * identity verification, compliance enforcement, and event logging.
 */
import type * as z from "zod";
import { ComplianceMonitor } from "./compliance";
import { AgentIdentity } from "./identity";
import { SekuireLogger } from "./logger";
export interface SekuireAgentConfig {
    /** Agent identity (sekuire.json) */
    identity?: AgentIdentity;
    /** Compliance configuration file path */
    configPath?: string;
    /** Logger configuration */
    logger?: {
        apiBaseUrl?: string;
        environment?: string;
        enabled?: boolean;
    };
    /** Optional custom compliance monitor */
    compliance?: ComplianceMonitor;
}
export interface ToolDefinition<T extends z.ZodObject<any> = any> {
    /** Unique tool name */
    name: string;
    /** Human-readable description */
    description: string;
    /** Zod schema for input validation */
    schema: T;
    /** Tool execution function */
    execute: (input: z.infer<T>) => Promise<unknown> | unknown;
    /** Optional: Additional compliance checks */
    beforeExecute?: (input: z.infer<T>) => Promise<void> | void;
}
export interface Message {
    role: "user" | "assistant" | "system";
    content: string;
}
export interface AgentInvokeOptions {
    messages: Message[];
    tools?: string[];
}
export interface AgentResponse {
    message: string;
    toolCalls?: ToolCall[];
    metadata?: {
        tokensUsed?: number;
        toolsInvoked?: string[];
        complianceViolations?: number;
    };
}
export interface ToolCall {
    tool: string;
    input: any;
    output: any;
    allowed: boolean;
    reason?: string;
}
export declare class SekuireAgent {
    private identity;
    private compliance;
    private logger;
    private tools;
    constructor(identity: AgentIdentity, compliance: ComplianceMonitor, logger: SekuireLogger);
    /**
     * Get agent identity
     */
    getIdentity(): AgentIdentity;
    /**
     * Get compliance monitor
     */
    getCompliance(): ComplianceMonitor;
    /**
     * Get logger
     */
    getLogger(): SekuireLogger;
    /**
     * Register a tool with the agent
     */
    registerTool<T extends z.ZodObject<any>>(tool: ToolDefinition<T>): this;
    /**
     * Register multiple tools at once
     */
    registerTools(tools: ToolDefinition[]): this;
    /**
     * Get registered tools
     */
    getTools(names?: string[]): ToolDefinition[];
    /**
     * Execute a tool by name
     */
    executeTool(name: string, input: any): Promise<any>;
    /**
     * Invoke the agent (to be implemented by subclasses or plugins)
     */
    invoke(options: AgentInvokeOptions): Promise<AgentResponse>;
    /**
     * Shutdown agent and flush logs
     */
    shutdown(): Promise<void>;
}
export declare class SekuireAgentBuilder {
    private config;
    private tools;
    /**
     * Set agent identity
     */
    withIdentity(identity: AgentIdentity): this;
    /**
     * Load identity from disk
     */
    loadIdentity(path?: string): Promise<this>;
    /**
     * Set compliance config path
     */
    withConfig(path: string): this;
    /**
     * Set logger options
     */
    withLogger(options: NonNullable<SekuireAgentConfig["logger"]>): this;
    /**
     * Add a tool
     */
    withTool<T extends z.ZodObject<any>>(tool: ToolDefinition<T>): this;
    /**
     * Add multiple tools
     */
    withTools(tools: ToolDefinition[]): this;
    /**
     * Build the agent
     */
    build(): Promise<SekuireAgent>;
}
/**
 * Create a new Sekuire agent with compliance and identity
 *
 * @example
 * ```typescript
 * const agent = await createAgent({
 *   configPath: './sekuire.yaml',
 *   tools: [weatherTool, calculatorTool],
 * });
 * ```
 */
export declare function createAgent(config?: {
    identity?: AgentIdentity;
    configPath?: string;
    tools?: ToolDefinition[];
    logger?: SekuireAgentConfig["logger"];
}): Promise<SekuireAgent>;
/**
 * Create a compliant tool definition
 *
 * @example
 * ```typescript
 * const weatherTool = tool({
 *   name: 'get_weather',
 *   description: 'Get weather for a city',
 *   schema: z.object({
 *     city: z.string(),
 *   }),
 *   execute: async ({ city }) => {
 *     return `Weather in ${city}: Sunny`;
 *   },
 * });
 * ```
 */
export declare function tool<T extends z.ZodObject<any>>(definition: ToolDefinition<T>): ToolDefinition<T>;
/**
 * Create multiple tools at once
 *
 * @example
 * ```typescript
 * const [weather, calc] = tools(
 *   { name: 'weather', ... },
 *   { name: 'calculator', ... }
 * );
 * ```
 */
export declare function tools<T extends ToolDefinition[]>(...definitions: T): T;
/**
 * Get tools registered with an agent
 */
export declare function getTools(agent: SekuireAgent, names?: string[]): ToolDefinition[];
