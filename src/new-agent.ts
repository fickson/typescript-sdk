import fs from 'fs/promises';
import {
    getAgentConfig,
    loadConfig,
    loadSystemPrompt,
    loadTools,
    type AgentConfig,
    type ToolDefinition
} from './config/loader';
import { createLLMProvider } from './llm';
import type { ChatOptions, LLMProvider, Message } from './llm/types';
import { createMemoryStorage, type MemoryMessage, type MemoryStorage } from './memory';
import type { ActivePolicy } from './policy';
import { PolicyEnforcer } from './policy-enforcer';
import { getTracer } from './telemetry';
import { createDefaultToolRegistry, type Tool } from './tools';

try {
  const dotenv = require('dotenv');
  dotenv.config();
} catch {
  // dotenv is optional - env vars can be set externally
}

// Global cache for policy files to prevent repetitive disk I/O
const policyCache = new Map<string, ActivePolicy>();

let ctaShown = false;

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
export class SekuireAgent {
  public readonly name: string;
  private llm: LLMProvider;
  private systemPrompt: string;
  private tools: ToolDefinition[];
  private sessionId: string = 'default';
  private memory?: MemoryStorage;
  private maxHistoryMessages: number = 10;
  private policyEnforcer?: PolicyEnforcer;

  constructor(config: {
    name: string;
    llm: LLMProvider;
    systemPrompt: string;
    tools: ToolDefinition[];
    memory?: MemoryStorage;
    maxHistoryMessages?: number;
    policyEnforcer?: PolicyEnforcer;
  }) {
    this.name = config.name;
    this.llm = config.llm;
    this.systemPrompt = config.systemPrompt;
    this.tools = config.tools;
    this.memory = config.memory;
    this.maxHistoryMessages = config.maxHistoryMessages || 10;
    this.policyEnforcer = config.policyEnforcer;
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Chat with the agent
   */
  async chat(userMessage: string, options?: ChatOptions): Promise<string> {
    const tracer = getTracer();
    return tracer.startActiveSpan('chat', async (span: any) => {
      try {
        span.setAttribute('user_message_length', userMessage.length);

        if (this.policyEnforcer) {
          this.policyEnforcer.enforceModel(this.getModelName());
          this.policyEnforcer.enforceRateLimit('request');
        }

        let historyMessages: Message[] = [];
        if (this.memory) {
          const memoryMessages = await this.memory.get(this.sessionId, this.maxHistoryMessages);
          historyMessages = memoryMessages.map((m: any) => ({
            role: m.role,
            content: m.content
          }));
        }

        const messages: Message[] = [
          { role: 'system', content: this.systemPrompt },
          ...historyMessages,
          { role: 'user', content: userMessage },
        ];

        if (this.memory) {
          await this.memory.add(this.sessionId, {
            role: 'user',
            content: userMessage,
            timestamp: Date.now()
          });
        }

        let turns = 0;
        const MAX_TURNS = 5;

        while (turns < MAX_TURNS) {
          const tools = this.getTools().map(t => ({
            type: "function" as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.schema
            }
          }));

          const response = await this.llm.chat(messages, {
            ...options,
            tools: tools.length > 0 ? tools : undefined
          });

          if (response.tool_calls && response.tool_calls.length > 0) {
            const assistantMessage = {
              role: 'assistant' as const,
              content: response.content || null,
              tool_calls: response.tool_calls
            };
            messages.push(assistantMessage);

            for (const call of response.tool_calls) {
              try {
                const args = JSON.parse(call.function.arguments);
                const result = await this.executeTool(call.function.name, args);
                messages.push({
                  role: 'tool' as const,
                  tool_call_id: call.id,
                  content: typeof result === 'string' ? result : JSON.stringify(result),
                  name: call.function.name
                });
              } catch (error: any) {
                messages.push({
                  role: 'tool' as const,
                  tool_call_id: call.id,
                  content: `Error: ${error.message}`,
                  name: call.function.name
                });
              }
            }
            turns++;
          } else {
            if (this.memory) {
              await this.memory.add(this.sessionId, {
                role: 'assistant',
                content: response.content,
                timestamp: Date.now()
              });
            }
            span.setAttribute('response_length', response.content.length);
            span.end();
            return response.content;
          }
        }

        span.end();
        return "Error: Maximum conversation turns reached.";
      } catch (error) {
        span.recordException(error as Error);
        span.end();
        throw error;
      }
    });
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, args: any): Promise<any> {
    const tracer = getTracer();
    return tracer.startActiveSpan(`tool:${name}`, async (span: any) => {
      try {
        span.setAttribute('tool.name', name);
        span.setAttribute('tool.args', JSON.stringify(args));

        if (this.policyEnforcer) {
          this.policyEnforcer.enforceTool(name);
        }

        const toolRegistry = createDefaultToolRegistry();
        const toolInstance = toolRegistry.get(name);

        if (!toolInstance) {
          throw new Error(`Tool implementation not found for: ${name}`);
        }

        if (this.policyEnforcer) {
          toolInstance.setPolicyEnforcer(this.policyEnforcer);
        }

        const result = await toolInstance.execute(args);
        span.end();
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.end();
        throw error;
      }
    });
  }

  /**
   * Stream chat response
   */
  async *chatStream(
    userMessage: string,
    options?: ChatOptions
  ): AsyncGenerator<string> {
    // 1. Enforce Policy
    if (this.policyEnforcer) {
      this.policyEnforcer.enforceModel(this.getModelName());
      this.policyEnforcer.enforceRateLimit('request');
    }

    // Streaming doesn't easily support tool loops in this simple implementation
    // Pass tools anyway, but if tool_calls happen, we might not handle them gracefully in stream
    // For MVP, assume simple chat for stream.
    
    // Get conversation history from memory
    const history = this.memory
      ? await this.memory.get(this.sessionId, this.maxHistoryMessages)
      : [];

    // Build messages array
    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...history.map((m: MemoryMessage) => ({ role: m.role as Message['role'], content: m.content })),
      { role: 'user', content: userMessage },
    ];

    let fullResponse = '';

    // Stream response from LLM
    for await (const chunk of this.llm.chatStream(messages, options)) {
      fullResponse += chunk.content;
      yield chunk.content;
    }

    // Store in memory
    if (this.memory) {
      await this.memory.add(this.sessionId, { role: 'user', content: userMessage, timestamp: Date.now() });
      await this.memory.add(this.sessionId, { role: 'assistant', content: fullResponse, timestamp: Date.now() });
    }
  }

  /**
   * Clear conversation history
   */
  async clearHistory(): Promise<void> {
    if (this.memory) {
      await this.memory.clear(this.sessionId);
    }
  }

  /**
   * Get conversation history
   */
  async getHistory(): Promise<Message[]> {
    if (!this.memory) return [];
    const history = await this.memory.get(this.sessionId);
    return history.map((m: MemoryMessage) => ({ role: m.role as Message['role'], content: m.content }));
  }

  /**
   * Get LLM provider name
   */
  getLLMProvider(): string {
    return this.llm.getProviderName();
  }

  /**
   * Get LLM model name
   */
  getModelName(): string {
    return this.llm.getModelName();
  }

  /**
   * Get available tools
   */
  getTools(): ToolDefinition[] {

    // Filter tools if policy is present
    if (this.policyEnforcer) {
      const allowedTools: ToolDefinition[] = [];
      for (const tool of this.tools) {
        try {
          // If enforceTool throws, it's not allowed
          this.policyEnforcer.enforceTool(tool.name);

          allowedTools.push(tool);
        } catch (e: any) {
          // Tool blocked by policy, skip it

        }
      }
      return allowedTools;
    }
    return [...this.tools];
  }

  /**
   * Get the active policy enforcer
   */
  public getPolicyEnforcer(): PolicyEnforcer | undefined {
    return this.policyEnforcer;
  }
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
export async function getAgent(
  agentName?: string,
  overrides?: AgentOptions,
  configPath?: string
): Promise<SekuireAgent> {
  // Load configuration
  const config = await loadConfig(configPath);

  // Get agent configuration
  const agentConfig = getAgentConfig(config, agentName);

  // Create LLM provider
  const llmProvider =
    overrides?.llm || (await createLLMProviderFromConfig(agentConfig.llm));

  // Load system prompt
  const systemPrompt =
    overrides?.systemPrompt || (await loadSystemPrompt(agentConfig.system_prompt));

  // Helper to convert Tool instance to ToolDefinition
  const convertToolToDefinition = (tool: Tool): ToolDefinition => ({
    name: tool.metadata.name,
    description: tool.metadata.description,
    category: tool.metadata.category,
    schema: {
      type: 'object',
      properties: Object.fromEntries(
        tool.metadata.parameters.map(p => [
          p.name,
          {
            type: p.type,
            description: p.description,
            ...(p.default && { default: p.default }),
          },
        ]),
      ),
      required: tool.metadata.parameters.filter(p => p.required).map(p => p.name),
    },
    implementation: 'builtin',
  });

  // Load tools
  const toolsSchema = await loadTools(agentConfig.tools);
  const customTools = overrides?.tools || toolsSchema.tools || [];
  
  // Load builtin tools based on toolsets configuration
  const allTools: ToolDefinition[] = [...customTools];
  if (agentConfig.toolsets?.allowed_tools) {
    const toolRegistry = createDefaultToolRegistry();
    for (const toolConfig of agentConfig.toolsets.allowed_tools) {
      const toolName = toolConfig.name;
      
      // Check if it's a category pattern (e.g., "files:*" or "files")
      if (toolName.includes(':') && toolName.endsWith('*')) {
        const category = toolName.replace(':*', '');
        const toolNames = toolRegistry.getToolsByCategory(category);
        for (const name of toolNames) {
          const tool = toolRegistry.get(name);
          if (tool) {
            allTools.push(convertToolToDefinition(tool));
          }
        }
      } else if (toolName.includes(':')) {
        // Specific tool in category (e.g., "files:read")
        const tool = toolRegistry.get(toolName);
        if (tool) {
          allTools.push(convertToolToDefinition(tool));
        }
      } else {
        // Check if it's just a category name (backward compatibility)
        const toolNames = toolRegistry.getToolsByCategory(toolName);
        if (toolNames.length > 0) {
          for (const name of toolNames) {
            const tool = toolRegistry.get(name);
            if (tool) {
              allTools.push(convertToolToDefinition(tool));
            }
          }
        } else {
          // Exact tool name
          const tool = toolRegistry.get(toolName);
          if (tool) {
            allTools.push(convertToolToDefinition(tool));
          }
        }
      }
    }
  }
  
  const seenNames = new Set<string>();
  const tools = allTools.filter(t => {
    if (seenNames.has(t.name)) return false;
    seenNames.add(t.name);
    return true;
  });

  // Create memory storage
  let memory: MemoryStorage | undefined;
  if (agentConfig.memory) {
    memory = createMemoryStorage({
      type: agentConfig.memory.type || 'in-memory',
      redis: agentConfig.memory.redis,
      postgres: agentConfig.memory.postgres,
      sqlite: agentConfig.memory.sqlite || (agentConfig.memory.config as { filename: string } | undefined),
    });
  } else if (overrides?.memory) {
    memory = overrides.memory;
  }

  // Get memory config
  const maxHistoryMessages = agentConfig.memory?.max_messages || 10;

  // Load Policy from config or separate file
  let policyEnforcer: PolicyEnforcer | undefined;
  
  try {
    let activePolicy: ActivePolicy;

    // Option 1: Try to load from separate policy.json file (backward compatibility)
    const policyPath = overrides?.policyPath || 'policy.json';
    
    try {
      if (policyCache.has(policyPath)) {
        activePolicy = policyCache.get(policyPath)!;
      } else {
        const policyContent = await fs.readFile(policyPath, 'utf-8');
        activePolicy = JSON.parse(policyContent) as ActivePolicy;
        policyCache.set(policyPath, activePolicy);
      }
    } catch (fileError) {
      // Option 2: Build policy from sekuire.yml config (NEW - correct way)
      activePolicy = {
        policy_id: `${config.project.name}-policy`,
        workspace_id: 'local',
        version: config.project.version || '1.0.0',
        status: 'active',
        hash: 'config-based',
        content: {
          agent: {
            models: agentConfig.models || {}
          },
          tools: agentConfig.toolsets || {},
          permissions: config.permissions || {},
          rate_limits: config.rate_limits || {}
        }
      };
    }

    policyEnforcer = new PolicyEnforcer(activePolicy);
  } catch (error) {
    // No policy configured - proceed without enforcement
    // console.warn(`⚠️  No policy configured. Running in unrestricted mode.`);
  }

  if (!ctaShown && !process.env.SEKUIRE_INSTALL_TOKEN && process.env.SEKUIRE_NO_CTA !== 'true') {
    ctaShown = true;
    console.info(
      '[sekuire] Running in standalone mode. Add SEKUIRE_INSTALL_TOKEN for central governance, audit, and fleet management. https://sekuire.ai/docs/guides/developer/upgrade-from-standalone'
    );
  }

  // Create and return agent
  return new SekuireAgent({
    name: agentConfig.name,
    llm: llmProvider,
    systemPrompt,
    tools,
    memory,
    maxHistoryMessages,
    policyEnforcer,
  });
}

/**
 * Create LLM provider from configuration
 */
async function createLLMProviderFromConfig(
  llmConfig: AgentConfig['llm']
): Promise<LLMProvider> {
  // Get API key from environment
  const apiKey = process.env[llmConfig.api_key_env];
  if (!apiKey) {
    throw new Error(
      `API key not found: ${llmConfig.api_key_env}. ` +
        `Please set this environment variable.`
    );
  }

  // Create provider
  return createLLMProvider(llmConfig.provider, {
    apiKey,
    model: llmConfig.model,
    baseUrl: llmConfig.base_url,
    temperature: llmConfig.temperature,
    maxTokens: llmConfig.max_tokens,
  });
}

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
export async function getAgents(
  configPath?: string
): Promise<Map<string, SekuireAgent>> {
  const config = await loadConfig(configPath);
  const agentsMap = new Map<string, SekuireAgent>();

  if (config.agents) {
    // Multi-agent configuration
    for (const agentName of Object.keys(config.agents)) {
      const agent = await getAgent(agentName, undefined, configPath);
      agentsMap.set(agentName, agent);
    }
  } else if (config.agent) {
    // Single agent configuration
    const agent = await getAgent(undefined, undefined, configPath);
    agentsMap.set(config.project.name, agent);
  }

  return agentsMap;
}

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
export async function getSystemPrompt(
  agentName?: string,
  configPath?: string
): Promise<string> {
  const config = await loadConfig(configPath);
  const agentConfig = getAgentConfig(config, agentName);
  return await loadSystemPrompt(agentConfig.system_prompt);
}

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
export async function getTools(
  agentName?: string,
  configPath?: string
): Promise<ToolDefinition[]> {
  const config = await loadConfig(configPath);
  const agentConfig = getAgentConfig(config, agentName);
  const toolsSchema = await loadTools(agentConfig.tools);
  return toolsSchema.tools || [];
}