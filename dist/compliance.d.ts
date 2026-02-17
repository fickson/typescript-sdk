/**
 * 🛡️ Sekuire Compliance Enforcement System for TypeScript
 *
 * Runtime compliance enforcement that blocks all unauthorized behavior.
 * Everything blocked unless explicitly allowed in sekuire.yaml.
 */
import type { SekuireLogger } from "./logger";
export interface ComplianceConfig {
    agent: {
        name: string;
        version: string;
        tenant?: string;
        compliance_level?: string;
    };
    permissions: {
        network: {
            default_deny?: boolean;
            allow: string[];
            block?: string[];
        };
        filesystem: {
            default_deny?: boolean;
            allow_read: string[];
            allow_write: string[];
            block_all?: string[];
        };
        env: {
            default_deny?: boolean;
            allow: string[];
            block?: string[];
        };
        tools: {
            enforce_whitelist: boolean;
            audit_all_calls?: boolean;
            blocked_patterns: string[];
            timeout_seconds?: number;
        };
        model: {
            allowed_models: string[];
            max_temperature: number;
            max_tokens: number;
            audit_api_calls?: boolean;
        };
        content: {
            blocked_input_patterns: string[];
            blocked_output_patterns: string[];
            max_response_length?: number;
        };
    };
    logging?: {
        level: string;
        audit_all_requests?: boolean;
        audit_all_tool_calls?: boolean;
        log_network_requests?: boolean;
        log_file_access?: boolean;
        retention_days?: number;
    };
    alerts?: {
        real_time_monitoring?: boolean;
        security_violation_alerts?: boolean;
        compliance_breach_alerts?: boolean;
        performance_anomaly_alerts?: boolean;
    };
    enterprise?: {
        tenant_id?: string;
        department?: string;
        cost_center?: string;
    };
}
export interface ComplianceViolation {
    timestamp: Date;
    category: string;
    message: string;
    details: Record<string, any>;
    agentId: string;
}
export declare class ComplianceError extends Error {
    readonly category: string;
    readonly details: Record<string, any>;
    constructor(message: string, category?: string, details?: Record<string, any>);
}
export declare class NetworkComplianceError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
export declare class FileAccessError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
export declare class ToolUsageError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
export declare class ContentPolicyError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
/**
 * 🔒 Runtime compliance enforcement system
 *
 * Enforces all rules defined in sekuire.yaml:
 * - Network access control
 * - File system restrictions
 * - Tool usage limits
 * - Content filtering
 * - Environment variable access
 */
export declare class ComplianceMonitor {
    private configPath;
    private config;
    private violations;
    private logger?;
    private networkAllowSet;
    private networkBlockSet;
    private filesReadSet;
    private filesWriteSet;
    private filesBlockPatterns;
    private envAllowSet;
    private envBlockSet;
    private allowedToolsSet;
    private toolBlockPatterns;
    private inputBlockPatterns;
    private outputBlockPatterns;
    private allowedModelsSet;
    private networkCache;
    private contentCache;
    private readonly maxCacheSize;
    constructor(configPath?: string, logger?: SekuireLogger);
    private loadConfig;
    private buildIndexes;
    private loadAllowedTools;
    /**
     * 🌐 Check if network access is allowed
     *
     * @param url Target URL
     * @param method HTTP method (GET, POST, etc.)
     * @throws NetworkComplianceError If access is blocked
     */
    checkNetworkAccess(url: string, method?: string): boolean;
    /**
     * Create a safe fetch function with compliance enforcement
     */
    createSafeFetch(originalFetch?: typeof fetch): typeof fetch;
    /**
     * 📁 Check if file access is allowed
     *
     * @param filePath File path
     * @param mode 'read', 'write', 'execute'
     * @throws FileAccessError If access is blocked
     */
    checkFileAccess(filePath: string, mode?: "read" | "write" | "execute"): boolean;
    /**
     * Safe file reading with compliance check
     */
    safeReadFile(filePath: string, encoding?: BufferEncoding): string;
    /**
     * Safe file writing with compliance check
     */
    safeWriteFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding): void;
    /**
     * 🔐 Check if environment variable access is allowed
     *
     * @param varName Environment variable name
     * @throws ComplianceError If access is blocked
     */
    checkEnvAccess(varName: string): boolean;
    /**
     * Safe environment variable access
     */
    safeGetEnv(varName: string, defaultValue?: string): string | undefined;
    /**
     * 🛠️ Check if tool usage is allowed
     *
     * @param toolName Name of the tool
     * @param codeSnippet Code snippet for pattern checking
     * @throws ToolUsageError If tool usage is blocked
     */
    checkToolUsage(toolName: string, codeSnippet?: string): void;
    /**
     * 💬 Check input content for policy violations
     *
     * @param content Input content to check
     * @throws ContentPolicyError If content violates policy
     */
    checkInputContent(content: string): void;
    /**
     * 📤 Check output content for policy violations
     *
     * @param content Output content to check
     * @throws ContentPolicyError If content violates policy
     */
    checkOutputContent(content: string): void;
    private checkContent;
    /**
     * 🤖 Check AI model usage compliance
     *
     * @param model Model name
     * @param temperature Temperature setting
     * @param maxTokens Max tokens setting
     * @throws ComplianceError If model usage violates rules
     */
    checkModelUsage(model: string, temperature?: number, maxTokens?: number): boolean;
    /**
     * 🔢 Generate BLAKE3 hash for content integrity checking
     */
    hashContent(content: string): string;
    /**
     * Verify file hasn't been modified
     */
    checkFileIntegrity(filePath: string, expectedHash: string): boolean;
    /**
     * Log compliance violation
     */
    private logViolation;
    /**
     * 🚨 Send security alert to monitoring systems
     */
    private sendSecurityAlert;
    /**
     * 📊 Get current compliance status and statistics
     */
    getComplianceStatus(): Record<string, any>;
    /**
     * Get recent violations
     */
    getViolations(category?: string, limit?: number): ComplianceViolation[];
    /**
     * Clear violation log
     */
    clearViolations(): void;
    /**
     * Set cache value with size limit
     */
    private setCacheValue;
    /**
     * Pre-warm caches with common operations
     */
    preWarmCaches(): void;
}
export default ComplianceMonitor;
