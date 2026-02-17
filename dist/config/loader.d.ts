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
        allowed_services?: Array<{
            service_name: string;
            endpoints?: string[];
        }>;
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
    models?: {
        allowed_models?: string[];
        blocked_models?: string[];
    };
    toolsets?: {
        allowed_tools?: Array<{
            name: string;
            description?: string;
        }>;
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
    type: 'in-memory' | 'buffer' | 'redis' | 'postgres' | 'sqlite' | 'upstash' | 'cloudflare-kv' | 'cloudflare-d1' | 'dynamodb' | 'turso' | 'convex' | string;
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
    config?: Record<string, unknown>;
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
export declare function loadConfig(configPath?: string): Promise<SekuireConfig>;
/**
 * Load system prompt from file
 */
export declare function loadSystemPrompt(promptPath: string, basePath?: string): Promise<string>;
/**
 * Load tools configuration from JSON file
 */
export declare function loadTools(toolsPath: string, basePath?: string): Promise<ToolsSchema>;
/**
 * Get agent configuration by name
 * Supports both single agent and multi-agent configs
 */
export declare function getAgentConfig(config: SekuireConfig, agentName?: string): AgentConfig;
