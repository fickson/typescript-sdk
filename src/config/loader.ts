import fs from 'fs/promises';
import yaml from 'js-yaml';
import path from 'path';

export interface SekuireConfig {
  project: {
    name: string;
    version: string;
    description?: string;
    author?: string;
    license?: string;
  };
  agents?: {
    [key: string]: AgentConfig;
  };
  agent?: AgentConfig;
  llm?: LLMConfig;
  logger?: LoggerConfig;
  permissions?: PermissionsConfig;
  rate_limits?: RateLimitsConfig;
}

export interface PermissionsConfig {
  network?: {
    enabled?: boolean;
    require_tls?: boolean;
    allowed_domains?: string[];
    blocked_domains?: string[];
  };
  filesystem?: {
    enabled?: boolean;
    allowed_paths?: string[];
    blocked_paths?: string[];
    allowed_extensions?: string[];
  };
  api?: {
    enabled?: boolean;
    allowed_services?: Array<{ service_name: string; endpoints?: string[] }>;
  };
}

export interface RateLimitsConfig {
  per_agent?: {
    requests_per_minute?: number;
    tokens_per_hour?: number;
  };
}

export interface AgentConfig {
  name: string;
  system_prompt: string;
  tools: string;
  llm: LLMConfig;
  memory?: MemoryConfig;
  compliance?: ComplianceConfig;
  // Legacy/generated schema fields (supported for backwards compatibility)
  allowed_tools?: string[];
  blocked_tools?: string[];
  network?: {
    enabled?: boolean;
    require_tls?: boolean;
    allow?: string[];
    block?: string[];
  };
  filesystem?: {
    enabled?: boolean;
    allow_read?: string[];
    allow_write?: string[];
    block_all?: string[];
    allowed_extensions?: string[];
  };
  models?: {
    allowed_models?: string[];
    blocked_models?: string[];
  };
  toolsets?: {
    allowed_tools?: Array<{ name: string; description?: string }>;
    blocked_tools?: string[];
  };
}

export interface LLMConfig {
  provider: string;
  model: string;
  api_key_env: string;
  temperature?: number;
  max_tokens?: number;
  streaming?: boolean;
  base_url?: string;
}

export interface MemoryConfig {
  type:
    | 'in-memory'
    | 'buffer'
    | 'redis'
    | 'postgres'
    | 'sqlite'
    | 'file'
    | 'upstash'
    | 'cloudflare-kv'
    | 'cloudflare-d1'
    | 'dynamodb'
    | 'turso'
    | 'convex'
    | string;
  max_messages?: number;
  redis?: {
    url?: string;
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
  };
  postgres?: {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    tableName?: string;
  };
  sqlite?: {
    filename: string;
    tableName?: string;
  };
  file?: {
    path: string;
  };
  upstash?: {
    url: string;
    token: string;
    keyPrefix?: string;
  };
  cloudflareKV?: {
    namespaceId?: string;
    accountId?: string;
    apiToken?: string;
    keyPrefix?: string;
  };
  cloudflareD1?: {
    databaseId?: string;
    accountId?: string;
    apiToken?: string;
    tableName?: string;
  };
  dynamodb?: {
    tableName: string;
    region?: string;
    endpoint?: string;
    createTable?: boolean;
  };
  turso?: {
    url: string;
    authToken?: string;
    tableName?: string;
  };
  convex?: {
    url: string;
    adminKey?: string;
  };
  config?: {
    // Common generated template fields
    filename?: string;
    path?: string;
    url?: string;
    token?: string;
    table_name?: string;
    tableName?: string;
    namespace_id?: string;
    namespaceId?: string;
    database_id?: string;
    databaseId?: string;
    account_id?: string;
    accountId?: string;
    api_token?: string;
    apiToken?: string;
    auth_token?: string;
    authToken?: string;
    admin_key?: string;
    adminKey?: string;
    connection_string?: string;
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    db?: number;
    keyPrefix?: string;
    endpoint?: string;
    create_table?: boolean;
    createTable?: boolean;
    readonly?: boolean;
    [key: string]: unknown;
  };
}

export interface ComplianceConfig {
  framework?: string;
  audit_logging?: boolean;
  sensitive_data_detection?: boolean;
  require_approval?: string[];
}

export interface LoggerConfig {
  api_base_url?: string;
  environment?: string;
  enabled?: boolean;
}

export interface ToolsSchema {
  version: string;
  tools: ToolDefinition[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  category?: string;
  schema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  implementation: string;
  permissions?: any;
  compliance?: any;
}

/**
 * Load sekuire.yml configuration file
 */
export async function loadConfig(configPath: string = './sekuire.yml'): Promise<SekuireConfig> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.load(content) as SekuireConfig;

    return resolveEnvVars(config);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw error;
  }
}

/**
 * Load system prompt from file
 */
export async function loadSystemPrompt(
  promptPath: string,
  basePath: string = '.'
): Promise<string> {
  try {
    const fullPath = path.isAbsolute(promptPath) ? promptPath : path.join(basePath, promptPath);

    return await fs.readFile(fullPath, 'utf-8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`System prompt file not found: ${promptPath}`);
    }
    throw error;
  }
}

/**
 * Load tools configuration from JSON file
 */
export async function loadTools(toolsPath: string, basePath: string = '.'): Promise<ToolsSchema> {
  try {
    const fullPath = path.isAbsolute(toolsPath) ? toolsPath : path.join(basePath, toolsPath);

    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content) as ToolsSchema;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Tools file not found: ${toolsPath}`);
    }
    throw error;
  }
}

/**
 * Resolve environment variables in config strings
 * Supports ${VAR} and ${VAR:-default} syntax
 */
function resolveEnvVars(obj: any): any {
  if (typeof obj === 'string') {
    // Match ${VAR} or ${VAR:-default}
    return obj.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (match, varName, defaultValue) => {
      const value = process.env[varName];
      return value !== undefined ? value : defaultValue || match;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVars(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const resolved: any = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveEnvVars(value);
    }
    return resolved;
  }

  return obj;
}

/**
 * Get agent configuration by name
 * Supports both single agent and multi-agent configs
 */
export function getAgentConfig(config: SekuireConfig, agentName?: string): AgentConfig {
  // Multi-agent config
  if (config.agents) {
    if (!agentName) {
      // Return first agent if no name specified
      const firstKey = Object.keys(config.agents)[0];
      if (!firstKey) {
        throw new Error('No agents defined in sekuire.yml');
      }
      return config.agents[firstKey];
    }

    const agentConfig = config.agents[agentName];
    if (!agentConfig) {
      throw new Error(`Agent '${agentName}' not found in sekuire.yml`);
    }
    return agentConfig;
  }

  // Single agent config
  if (config.agent) {
    const agentConfig = config.agent;
    // If agent config doesn't have LLM but root does, merge it
    if (!agentConfig.llm && config.llm) {
      return {
        ...agentConfig,
        name: agentConfig.name || config.project.name,
        llm: config.llm,
      };
    }
    return agentConfig;
  }

  // Legacy: use top-level llm config
  if (config.llm) {
    return {
      name: config.project.name,
      system_prompt: './system_prompt.md',
      tools: './tools.json',
      llm: config.llm,
    };
  }

  throw new Error('No agent configuration found in sekuire.yml');
}
