import { type ToolDefinition } from './config/loader';
import type { ChatOptions, LLMProvider, Message } from './llm/types';
import { type MemoryStorage } from './memory';
import { PolicyEnforcer } from './policy-enforcer';
/**
 * Options for overriding agent configuration
 */
export interface AgentOptions {
    llm?: LLMProvider;
    tools?: ToolDefinition[];
    memory?: MemoryStorage;
    systemPrompt?: string;
    policyPath?: string;
}
/**
 * Sekuire Agent - Config-first AI agent
 */
export declare class SekuireAgent {
    readonly name: string;
    private llm;
    private systemPrompt;
    private tools;
    private sessionId;
    private memory?;
    private maxHistoryMessages;
    private policyEnforcer?;
    constructor(config: {
        name: string;
        llm: LLMProvider;
        systemPrompt: string;
        tools: ToolDefinition[];
        memory?: MemoryStorage;
        maxHistoryMessages?: number;
        policyEnforcer?: PolicyEnforcer;
    });
    setSessionId(sessionId: string): void;
    /**
     * Chat with the agent
     */
    chat(userMessage: string, options?: ChatOptions): Promise<string>;
    /**
     * Execute a tool by name
     */
    executeTool(name: string, args: any): Promise<any>;
    /**
     * Stream chat response
     */
    chatStream(userMessage: string, options?: ChatOptions): AsyncGenerator<string>;
    /**
     * Clear conversation history
     */
    clearHistory(): Promise<void>;
    /**
     * Get conversation history
     */
    getHistory(): Promise<Message[]>;
    /**
     * Get LLM provider name
     */
    getLLMProvider(): string;
    /**
     * Get LLM model name
     */
    getModelName(): string;
    /**
     * Get available tools
     */
    getTools(): ToolDefinition[];
    /**
     * Get the active policy enforcer
     */
    getPolicyEnforcer(): PolicyEnforcer | undefined;
}
/**
 * Load an agent from sekuire.yml configuration
 *
 * @param agentName - Name of the agent to load (for multi-agent configs)
 * @param overrides - Optional overrides for agent configuration
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns Initialized agent instance
 *
 * @example
 * ```typescript
 * // Load agent from config
 * const agent = await getAgent('my-agent-openai');
 *
 * // Chat with the agent
 * const response = await agent.chat('Hello!');
 * console.log(response);
 * ```
 */
export declare function getAgent(agentName?: string, overrides?: AgentOptions, configPath?: string): Promise<SekuireAgent>;
/**
 * Load all agents from configuration
 *
 * @param configPath - Path to sekuire.yml
 * @returns Map of agent name to agent instance
 *
 * @example
 * ```typescript
 * const agents = await getAgents();
 * const openai = agents.get('my-agent-openai');
 * const claude = agents.get('my-agent-claude');
 * ```
 */
export declare function getAgents(configPath?: string): Promise<Map<string, SekuireAgent>>;
/**
 * Get system prompt for a specific agent from configuration
 *
 * @param agentName - Name of the agent (optional for single-agent configs)
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns The system prompt content
 *
 * @example
 * ```typescript
 * const prompt = await getSystemPrompt('my-agent-openai');
 * console.log(prompt);
 * ```
 */
export declare function getSystemPrompt(agentName?: string, configPath?: string): Promise<string>;
/**
 * Get tools for a specific agent from configuration
 *
 * @param agentName - Name of the agent (optional for single-agent configs)
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns The tools schema with tool definitions
 *
 * @example
 * ```typescript
 * const toolsSchema = await getTools('my-agent-openai');
 * console.log(toolsSchema.tools);
 * ```
 */
export declare function getTools(agentName?: string, configPath?: string): Promise<ToolDefinition[]>;
