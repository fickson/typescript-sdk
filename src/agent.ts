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

// ============================================================================
// Types
// ============================================================================

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
  tools?: string[]; // Optional: filter which tools to use
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

// ============================================================================
// Sekuire Agent
// ============================================================================

export class SekuireAgent {
  private identity: AgentIdentity;
  private compliance: ComplianceMonitor;
  private logger: SekuireLogger;
  private tools: Map<string, ToolDefinition> = new Map();

  constructor(
    identity: AgentIdentity,
    compliance: ComplianceMonitor,
    logger: SekuireLogger,
  ) {
    this.identity = identity;
    this.compliance = compliance;
    this.logger = logger;
  }

  /**
   * Get agent identity
   */
  getIdentity(): AgentIdentity {
    return this.identity;
  }

  /**
   * Get compliance monitor
   */
  getCompliance(): ComplianceMonitor {
    return this.compliance;
  }

  /**
   * Get logger
   */
  getLogger(): SekuireLogger {
    return this.logger;
  }

  /**
   * Register a tool with the agent
   */
  registerTool<T extends z.ZodObject<any>>(tool: ToolDefinition<T>): this {
    // Wrap tool with compliance checks
    const wrappedTool: ToolDefinition<T> = {
      ...tool,
      execute: async (input: z.infer<T>) => {
        try {
          // Check tool usage compliance
          this.compliance.checkToolUsage(tool.name, JSON.stringify(input));

          // Run custom pre-execution checks
          if (tool.beforeExecute) {
            await tool.beforeExecute(input);
          }

          // Log tool execution
          this.logger.logEvent("tool_execution", "info", {
            tool: tool.name,
            input,
            status: "allowed",
          });

          // Execute the tool
          const result = await tool.execute(input);

          return result;
        } catch (error: any) {
          // Log violation
          this.logger.logEvent("policy_violation", "error", {
            tool: tool.name,
            input,
            error: error.message,
          });

          throw error;
        }
      },
    };

    this.tools.set(tool.name, wrappedTool);
    return this;
  }

  /**
   * Register multiple tools at once
   */
  registerTools(tools: ToolDefinition[]): this {
    tools.forEach((tool) => this.registerTool(tool));
    return this;
  }

  /**
   * Get registered tools
   */
  getTools(names?: string[]): ToolDefinition[] {
    if (names) {
      return names
        .map((name) => this.tools.get(name))
        .filter((tool) => tool !== undefined) as ToolDefinition[];
    }
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, input: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool '${name}' not found`);
    }

    // Validate input
    const validatedInput = tool.schema.parse(input);

    // Execute (compliance checks happen inside)
    return await tool.execute(validatedInput);
  }

  /**
   * Invoke the agent (to be implemented by subclasses or plugins)
   */
  async invoke(options: AgentInvokeOptions): Promise<AgentResponse> {
    throw new Error("invoke() must be implemented by a plugin or subclass");
  }

  /**
   * Shutdown agent and flush logs
   */
  async shutdown(): Promise<void> {
    await this.logger.flush();
    await this.logger.shutdown();
  }
}

// ============================================================================
// Agent Builder
// ============================================================================

export class SekuireAgentBuilder {
  private config: SekuireAgentConfig = {};
  private tools: ToolDefinition[] = [];

  /**
   * Set agent identity
   */
  withIdentity(identity: AgentIdentity): this {
    this.config.identity = identity;
    return this;
  }

  /**
   * Load identity from disk
   */
  async loadIdentity(path?: string): Promise<this> {
    this.config.identity = await AgentIdentity.load(path);
    return this;
  }

  /**
   * Set compliance config path
   */
  withConfig(path: string): this {
    this.config.configPath = path;
    return this;
  }

  /**
   * Set logger options
   */
  withLogger(options: NonNullable<SekuireAgentConfig["logger"]>): this {
    this.config.logger = options;
    return this;
  }

  /**
   * Add a tool
   */
  withTool<T extends z.ZodObject<any>>(tool: ToolDefinition<T>): this {
    this.tools.push(tool);
    return this;
  }

  /**
   * Add multiple tools
   */
  withTools(tools: ToolDefinition[]): this {
    this.tools.push(...tools);
    return this;
  }

  /**
   * Build the agent
   */
  async build(): Promise<SekuireAgent> {
    // Load identity if not provided
    if (!this.config.identity) {
      this.config.identity = await AgentIdentity.load(this.config.configPath);
    }

    const identity = this.config.identity;

    // Create logger
    const logger = new SekuireLogger({
      sekuireId: identity.sekuireId,
      apiBaseUrl: this.config.logger?.apiBaseUrl || "http://localhost:9300",
      environment: this.config.logger?.environment || "development",
      enabled: this.config.logger?.enabled !== false,
    });

    // Create compliance monitor
    const compliance =
      this.config.compliance ||
      new ComplianceMonitor(this.config.configPath || "./sekuire.yaml", logger);

    // Create agent
    const agent = new SekuireAgent(identity, compliance, logger);

    // Register tools
    agent.registerTools(this.tools);

    return agent;
  }
}

// ============================================================================
// Convenience Functions (LangChain-style API)
// ============================================================================

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
export async function createAgent(config?: {
  identity?: AgentIdentity;
  configPath?: string;
  tools?: ToolDefinition[];
  logger?: SekuireAgentConfig["logger"];
}): Promise<SekuireAgent> {
  const builder = new SekuireAgentBuilder();

  if (config?.identity) {
    builder.withIdentity(config.identity);
  } else {
    await builder.loadIdentity(config?.configPath);
  }

  if (config?.configPath) {
    builder.withConfig(config.configPath);
  }

  if (config?.logger) {
    builder.withLogger(config.logger);
  }

  if (config?.tools) {
    builder.withTools(config.tools);
  }

  return await builder.build();
}

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
export function tool<T extends z.ZodObject<any>>(
  definition: ToolDefinition<T>,
): ToolDefinition<T> {
  return definition;
}

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
export function tools<T extends ToolDefinition[]>(...definitions: T): T {
  return definitions;
}

/**
 * Get tools registered with an agent
 */
export function getTools(
  agent: SekuireAgent,
  names?: string[],
): ToolDefinition[] {
  return agent.getTools(names);
}
