/**
 * 🛡️ Sekuire Compliance Enforcement System for TypeScript
 *
 * Runtime compliance enforcement that blocks all unauthorized behavior.
 * Everything blocked unless explicitly allowed in sekuire.yaml.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import type { EventType, SekuireLogger, Severity } from "./logger";

// ==================== TYPES ====================

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

export class ComplianceError extends Error {
  constructor(
    message: string,
    public readonly category: string = "general",
    public readonly details: Record<string, any> = {},
  ) {
    super(message);
    this.name = "ComplianceError";
  }
}

export class NetworkComplianceError extends ComplianceError {
  constructor(message: string, details: Record<string, any> = {}) {
    super(message, "network", details);
    this.name = "NetworkComplianceError";
  }
}

export class FileAccessError extends ComplianceError {
  constructor(message: string, details: Record<string, any> = {}) {
    super(message, "filesystem", details);
    this.name = "FileAccessError";
  }
}

export class ToolUsageError extends ComplianceError {
  constructor(message: string, details: Record<string, any> = {}) {
    super(message, "tools", details);
    this.name = "ToolUsageError";
  }
}

export class ContentPolicyError extends ComplianceError {
  constructor(message: string, details: Record<string, any> = {}) {
    super(message, "content", details);
    this.name = "ContentPolicyError";
  }
}

// ==================== MAIN COMPLIANCE MONITOR ====================

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
export class ComplianceMonitor {
  private config!: ComplianceConfig;
  private violations: ComplianceViolation[] = [];
  private logger?: SekuireLogger;

  // Pre-computed fast lookup structures
  private networkAllowSet!: Set<string>;
  private networkBlockSet!: Set<string>;
  private filesReadSet!: Set<string>;
  private filesWriteSet!: Set<string>;
  private filesBlockPatterns!: string[];
  private envAllowSet!: Set<string>;
  private envBlockSet!: Set<string>;
  private allowedToolsSet!: Set<string>;
  private toolBlockPatterns!: RegExp[];
  private inputBlockPatterns!: RegExp[];
  private outputBlockPatterns!: RegExp[];
  private allowedModelsSet!: Set<string>;

  // Performance cache
  private networkCache = new Map<string, boolean>();
  private contentCache = new Map<string, boolean>();
  private readonly maxCacheSize = 10000;

  constructor(
    private configPath: string = "sekuire.yaml",
    logger?: SekuireLogger,
  ) {
    this.loadConfig();
    this.buildIndexes();
    this.logger = logger;
  }

  private loadConfig(): void {
    try {
      const configContent = fs.readFileSync(this.configPath, "utf8");
      this.config = yaml.load(configContent) as ComplianceConfig;

      if (!this.config) {
        throw new Error("Invalid compliance configuration");
      }
    } catch (error) {
      throw new Error(
        `Failed to load compliance config: ${(error as Error).message}`,
      );
    }
  }

  private buildIndexes(): void {
    const permissions = this.config.permissions;

    // Network rules
    this.networkAllowSet = new Set(permissions.network.allow);
    this.networkBlockSet = new Set(permissions.network.block || []);

    // File system rules
    this.filesReadSet = new Set(permissions.filesystem.allow_read);
    this.filesWriteSet = new Set(permissions.filesystem.allow_write);
    this.filesBlockPatterns = permissions.filesystem.block_all || [];

    // Environment variable rules
    this.envAllowSet = new Set(permissions.env.allow);
    this.envBlockSet = new Set(permissions.env.block || []);

    // Tool rules - load from tools.json
    this.allowedToolsSet = this.loadAllowedTools();
    this.toolBlockPatterns = permissions.tools.blocked_patterns.map(
      (pattern) =>
        new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );

    // Content filtering rules
    this.inputBlockPatterns = permissions.content.blocked_input_patterns.map(
      (pattern) => new RegExp(pattern, "i"),
    );
    this.outputBlockPatterns = permissions.content.blocked_output_patterns.map(
      (pattern) => new RegExp(pattern, "i"),
    );

    // Model restrictions
    this.allowedModelsSet = new Set(permissions.model.allowed_models);
  }

  private loadAllowedTools(): Set<string> {
    const toolsPath = "tools.json"; // Default path

    if (!fs.existsSync(toolsPath)) {
      return new Set();
    }

    try {
      const toolsContent = fs.readFileSync(toolsPath, "utf8");
      const toolsData = JSON.parse(toolsContent);

      return new Set(
        (toolsData as Array<{ name?: string }>)
          .filter((tool) => tool.name)
          .map((tool) => tool.name as string),
      );
    } catch (error) {
      console.error(
        `Failed to load tools configuration: ${(error as Error).message}`,
      );
      return new Set();
    }
  }

  // ==================== NETWORK COMPLIANCE ====================

  /**
   * 🌐 Check if network access is allowed
   *
   * @param url Target URL
   * @param method HTTP method (GET, POST, etc.)
   * @throws NetworkComplianceError If access is blocked
   */
  checkNetworkAccess(url: string, method: string = "GET"): boolean {
    // Check cache first
    if (this.networkCache.has(url)) {
      return this.networkCache.get(url)!;
    }

    try {
      // Check blocklist first
      for (const blocked of this.networkBlockSet) {
        if (url.startsWith(blocked)) {
          const violation: ComplianceViolation = {
            timestamp: new Date(),
            category: "network",
            message: `Network access to ${url} blocked by blocklist rule: ${blocked}`,
            details: { url, method, rule: blocked },
            agentId: this.config.agent.name,
          };

          this.logViolation(violation);
          throw new NetworkComplianceError(
            violation.message,
            violation.details,
          );
        }
      }

      // Check allowlist
      if (this.networkAllowSet.size > 0) {
        const allowed = Array.from(this.networkAllowSet).some((allowed) =>
          url.startsWith(allowed),
        );
        if (!allowed) {
          const violation: ComplianceViolation = {
            timestamp: new Date(),
            category: "network",
            message: `Network access to ${url} not in allowlist`,
            details: { url, method },
            agentId: this.config.agent.name,
          };

          this.logViolation(violation);
          throw new NetworkComplianceError(
            violation.message,
            violation.details,
          );
        }
      }

      // Cache result
      this.setCacheValue(this.networkCache, url, true);

      // Log successful access for audit trail
      if (this.logger && this.config.logging?.log_network_requests) {
        this.logger.logEvent(
          "network_access" as EventType,
          "info" as Severity,
          {
            url,
            method,
            allowed: true,
            agentId: this.config.agent.name,
          },
        );
      }

      return true;
    } catch (error) {
      if (error instanceof NetworkComplianceError) {
        throw error;
      }

      const violation: ComplianceViolation = {
        timestamp: new Date(),
        category: "network",
        message: `Network access check failed: ${(error as Error).message}`,
        details: { url, method, error: (error as Error).message },
        agentId: this.config.agent.name,
      };

      this.logViolation(violation);
      throw new NetworkComplianceError(violation.message, violation.details);
    }
  }

  /**
   * Create a safe fetch function with compliance enforcement
   */
  createSafeFetch(
    originalFetch: typeof fetch = globalThis.fetch,
  ): typeof fetch {
    return async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";

      // Check compliance before making request
      this.checkNetworkAccess(url, method);

      // Make the request
      return originalFetch(input, init);
    };
  }

  // ==================== FILE SYSTEM COMPLIANCE ====================

  /**
   * 📁 Check if file access is allowed
   *
   * @param filePath File path
   * @param mode 'read', 'write', 'execute'
   * @throws FileAccessError If access is blocked
   */
  checkFileAccess(
    filePath: string,
    mode: "read" | "write" | "execute" = "read",
  ): boolean {
    try {
      // Normalize path
      const resolvedPath = path.resolve(filePath);

      // Check block patterns
      for (const blockedPattern of this.filesBlockPatterns) {
        if (
          resolvedPath.includes(blockedPattern) ||
          resolvedPath.startsWith(blockedPattern)
        ) {
          const violation: ComplianceViolation = {
            timestamp: new Date(),
            category: "filesystem",
            message: `File access blocked by pattern: ${blockedPattern}`,
            details: { path: resolvedPath, mode, pattern: blockedPattern },
            agentId: this.config.agent.name,
          };

          this.logViolation(violation);
          throw new FileAccessError(violation.message, violation.details);
        }
      }

      // Check allowlists
      if (mode === "read") {
        if (this.filesReadSet.size > 0) {
          const allowed = Array.from(this.filesReadSet).some(
            (allowed: string) =>
              resolvedPath.endsWith(allowed) || resolvedPath === allowed,
          );
          if (!allowed) {
            const violation: ComplianceViolation = {
              timestamp: new Date(),
              category: "filesystem",
              message: `File read access not allowed: ${resolvedPath}`,
              details: { path: resolvedPath, mode },
              agentId: this.config.agent.name,
            };

            this.logViolation(violation);
            throw new FileAccessError(violation.message, violation.details);
          }
        }
      } else if (mode === "write") {
        if (this.filesWriteSet.size > 0) {
          const allowed = Array.from(this.filesWriteSet).some(
            (allowed: string) => resolvedPath.startsWith(allowed),
          );
          if (!allowed) {
            const violation: ComplianceViolation = {
              timestamp: new Date(),
              category: "filesystem",
              message: `File write access not allowed: ${resolvedPath}`,
              details: { path: resolvedPath, mode },
              agentId: this.config.agent.name,
            };

            this.logViolation(violation);
            throw new FileAccessError(violation.message, violation.details);
          }
        }
      }

      return true;
    } catch (error) {
      if (error instanceof FileAccessError) {
        throw error;
      }

      const violation: ComplianceViolation = {
        timestamp: new Date(),
        category: "filesystem",
        message: `File access check failed: ${(error as Error).message}`,
        details: { path: filePath, mode, error: (error as Error).message },
        agentId: this.config.agent.name,
      };

      this.logViolation(violation);
      throw new FileAccessError(violation.message, violation.details);
    }
  }

  /**
   * Safe file reading with compliance check
   */
  safeReadFile(filePath: string, encoding: BufferEncoding = "utf8"): string {
    this.checkFileAccess(filePath, "read");
    return fs.readFileSync(filePath, encoding);
  }

  /**
   * Safe file writing with compliance check
   */
  safeWriteFile(
    filePath: string,
    data: string | Buffer,
    encoding?: BufferEncoding,
  ): void {
    this.checkFileAccess(filePath, "write");
    fs.writeFileSync(filePath, data, encoding);
  }

  // ==================== ENVIRONMENT VARIABLE COMPLIANCE ====================

  /**
   * 🔐 Check if environment variable access is allowed
   *
   * @param varName Environment variable name
   * @throws ComplianceError If access is blocked
   */
  checkEnvAccess(varName: string): boolean {
    try {
      // Check blocklist
      for (const blocked of this.envBlockSet) {
        if (varName.toLowerCase().includes(blocked.toLowerCase())) {
          const violation: ComplianceViolation = {
            timestamp: new Date(),
            category: "env",
            message: `Environment variable access blocked: ${varName}`,
            details: { varName },
            agentId: this.config.agent.name,
          };

          this.logViolation(violation);
          throw new ComplianceError(
            violation.message,
            "env",
            violation.details,
          );
        }
      }

      // Check allowlist
      if (this.envAllowSet.size > 0 && !this.envAllowSet.has(varName)) {
        const violation: ComplianceViolation = {
          timestamp: new Date(),
          category: "env",
          message: `Environment variable ${varName} not in allowlist`,
          details: { varName },
          agentId: this.config.agent.name,
        };

        this.logViolation(violation);
        throw new ComplianceError(violation.message, "env", violation.details);
      }

      return true;
    } catch (error) {
      if (error instanceof ComplianceError) {
        throw error;
      }

      const violation: ComplianceViolation = {
        timestamp: new Date(),
        category: "env",
        message: `Environment variable access check failed: ${(error as Error).message}`,
        details: { varName, error: (error as Error).message },
        agentId: this.config.agent.name,
      };

      this.logViolation(violation);
      throw new ComplianceError(violation.message, "env", violation.details);
    }
  }

  /**
   * Safe environment variable access
   */
  safeGetEnv(varName: string, defaultValue?: string): string | undefined {
    this.checkEnvAccess(varName);
    return process.env[varName] ?? defaultValue;
  }

  // ==================== TOOL USAGE COMPLIANCE ====================

  /**
   * 🛠️ Check if tool usage is allowed
   *
   * @param toolName Name of the tool
   * @param codeSnippet Code snippet for pattern checking
   * @throws ToolUsageError If tool usage is blocked
   */
  checkToolUsage(toolName: string, codeSnippet?: string): void {
    try {
      // Check blocked patterns in code
      if (codeSnippet) {
        for (const pattern of this.toolBlockPatterns) {
          if (pattern.test(codeSnippet)) {
            const violation: ComplianceViolation = {
              timestamp: new Date(),
              category: "tools",
              message: `Tool usage contains blocked pattern: ${pattern.source}`,
              details: { tool: toolName, pattern: pattern.source },
              agentId: this.config.agent.name,
            };

            this.logViolation(violation);
            throw new ToolUsageError(violation.message, violation.details);
          }
        }
      }

      // Check tool whitelist
      if (
        this.config.permissions.tools.enforce_whitelist &&
        !this.allowedToolsSet.has(toolName)
      ) {
        const violation: ComplianceViolation = {
          timestamp: new Date(),
          category: "tools",
          message: `Tool ${toolName} not in approved tools.json whitelist`,
          details: {
            tool: toolName,
            allowedTools: Array.from(this.allowedToolsSet),
          },
          agentId: this.config.agent.name,
        };

        this.logViolation(violation);
        throw new ToolUsageError(violation.message, violation.details);
      }

      if (this.logger && this.config.logging?.audit_all_tool_calls) {
        this.logger.logEvent(
          "tool_execution" as EventType,
          "info" as Severity,
          {
            tool: toolName,
            allowed: true,
            agentId: this.config.agent.name,
          },
        );
      }
    } catch (error) {
      if (error instanceof ToolUsageError) {
        throw error;
      }

      const violation: ComplianceViolation = {
        timestamp: new Date(),
        category: "tools",
        message: `Tool usage check failed: ${(error as Error).message}`,
        details: { tool: toolName, error: (error as Error).message },
        agentId: this.config.agent.name,
      };

      this.logViolation(violation);
      throw new ToolUsageError(violation.message, violation.details);
    }
  }

  // ==================== CONTENT POLICY COMPLIANCE ====================

  /**
   * 💬 Check input content for policy violations
   *
   * @param content Input content to check
   * @throws ContentPolicyError If content violates policy
   */
  checkInputContent(content: string): void {
    this.checkContent(content, this.inputBlockPatterns, "input");
  }

  /**
   * 📤 Check output content for policy violations
   *
   * @param content Output content to check
   * @throws ContentPolicyError If content violates policy
   */
  checkOutputContent(content: string): void {
    this.checkContent(content, this.outputBlockPatterns, "output");
  }

  private checkContent(
    content: string,
    patterns: RegExp[],
    contentType: "input" | "output",
  ): void {
    const cacheKey = `${contentType}:${content.slice(0, 100)}`;
    if (this.contentCache.has(cacheKey)) {
      return;
    }

    try {
      for (const pattern of patterns) {
        if (pattern.test(content)) {
          const violation: ComplianceViolation = {
            timestamp: new Date(),
            category: "content",
            message: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} contains blocked pattern: ${pattern.source}`,
            details: {
              pattern: pattern.source,
              contentLength: content.length,
              contentType,
            },
            agentId: this.config.agent.name,
          };

          this.logViolation(violation);
          throw new ContentPolicyError(violation.message, violation.details);
        }
      }

      // Check response length limit
      const maxLength = this.config.permissions.content.max_response_length;
      if (contentType === "output" && maxLength && content.length > maxLength) {
        const violation: ComplianceViolation = {
          timestamp: new Date(),
          category: "content",
          message: `${contentType} length ${content.length} exceeds maximum ${maxLength}`,
          details: { contentLength: content.length, maxLength, contentType },
          agentId: this.config.agent.name,
        };

        this.logViolation(violation);
        throw new ContentPolicyError(violation.message, violation.details);
      }

      this.setCacheValue(this.contentCache, cacheKey, true);
    } catch (error) {
      if (error instanceof ContentPolicyError) {
        throw error;
      }

      const violation: ComplianceViolation = {
        timestamp: new Date(),
        category: "content",
        message: `${contentType} content check failed: ${(error as Error).message}`,
        details: {
          error: (error as Error).message,
          contentLength: content.length,
          contentType,
        },
        agentId: this.config.agent.name,
      };

      this.logViolation(violation);
      throw new ContentPolicyError(violation.message, violation.details);
    }
  }

  // ==================== AI MODEL COMPLIANCE ====================

  /**
   * 🤖 Check AI model usage compliance
   *
   * @param model Model name
   * @param temperature Temperature setting
   * @param maxTokens Max tokens setting
   * @throws ComplianceError If model usage violates rules
   */
  checkModelUsage(
    model: string,
    temperature?: number,
    maxTokens?: number,
  ): boolean {
    try {
      // Check allowed models
      if (this.allowedModelsSet.size > 0 && !this.allowedModelsSet.has(model)) {
        const violation: ComplianceViolation = {
          timestamp: new Date(),
          category: "model",
          message: `Model ${model} not in allowlist`,
          details: { model, allowedModels: Array.from(this.allowedModelsSet) },
          agentId: this.config.agent.name,
        };

        this.logViolation(violation);
        throw new ComplianceError(
          violation.message,
          "model",
          violation.details,
        );
      }

      // Check temperature
      if (
        temperature !== undefined &&
        temperature > this.config.permissions.model.max_temperature
      ) {
        const violation: ComplianceViolation = {
          timestamp: new Date(),
          category: "model",
          message: `Temperature ${temperature} exceeds maximum ${this.config.permissions.model.max_temperature}`,
          details: { model, temperature },
          agentId: this.config.agent.name,
        };

        this.logViolation(violation);
        throw new ComplianceError(
          violation.message,
          "model",
          violation.details,
        );
      }

      // Check max tokens
      if (
        maxTokens !== undefined &&
        maxTokens > this.config.permissions.model.max_tokens
      ) {
        const violation: ComplianceViolation = {
          timestamp: new Date(),
          category: "model",
          message: `Max tokens ${maxTokens} exceeds maximum ${this.config.permissions.model.max_tokens}`,
          details: { model, maxTokens },
          agentId: this.config.agent.name,
        };

        this.logViolation(violation);
        throw new ComplianceError(
          violation.message,
          "model",
          violation.details,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ComplianceError) {
        throw error;
      }

      const violation: ComplianceViolation = {
        timestamp: new Date(),
        category: "model",
        message: `Model usage check failed: ${(error as Error).message}`,
        details: { model, error: (error as Error).message },
        agentId: this.config.agent.name,
      };

      this.logViolation(violation);
      throw new ComplianceError(violation.message, "model", violation.details);
    }
  }

  // ==================== INTEGRITY CHECKING ====================

  /**
   * 🔢 Generate BLAKE3 hash for content integrity checking
   */
  hashContent(content: string): string {
    return crypto.createHash("blake3").update(content).digest("hex");
  }

  /**
   * Verify file hasn't been modified
   */
  checkFileIntegrity(filePath: string, expectedHash: string): boolean {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      const actualHash = this.hashContent(content);

      if (actualHash !== expectedHash) {
        const violation: ComplianceViolation = {
          timestamp: new Date(),
          category: "integrity",
          message: `File integrity check failed: ${filePath}`,
          details: {
            file: filePath,
            expected: expectedHash,
            actual: actualHash,
          },
          agentId: this.config.agent.name,
        };

        this.logViolation(violation);
        throw new ComplianceError(
          violation.message,
          "integrity",
          violation.details,
        );
      }

      return true;
    } catch (error) {
      if (error instanceof ComplianceError) {
        throw error;
      }

      const violation: ComplianceViolation = {
        timestamp: new Date(),
        category: "integrity",
        message: `File integrity check failed: ${(error as Error).message}`,
        details: { file: filePath, error: (error as Error).message },
        agentId: this.config.agent.name,
      };

      this.logViolation(violation);
      throw new ComplianceError(
        violation.message,
        "integrity",
        violation.details,
      );
    }
  }

  // ==================== MONITORING & LOGGING ====================

  /**
   * Log compliance violation
   */
  private logViolation(violation: ComplianceViolation): void {
    this.violations.push(violation);

    // Console warning for development
    console.warn(
      `⚠️ Compliance Violation [${violation.category}]: ${violation.message}`,
    );

    // Log to Sekuire API via logger
    if (this.logger) {
      this.logger.logEvent(
        "policy_violation" as EventType,
        "error" as Severity,
        {
          category: violation.category,
          message: violation.message,
          details: violation.details,
          agentId: violation.agentId,
          timestamp: violation.timestamp.toISOString(),
        },
      );
    }

    // Send alerts if configured
    if (
      this.config.alerts?.[
        `${violation.category}_violation` as keyof typeof this.config.alerts
      ]
    ) {
      this.sendSecurityAlert(violation);
    }

    // Keep cache size manageable
    if (this.violations.length > 10000) {
      this.violations = this.violations.slice(-5000);
    }
  }

  /**
   * 🚨 Send security alert to monitoring systems
   */
  private async sendSecurityAlert(
    violation: ComplianceViolation,
  ): Promise<void> {
    try {
      // TODO: Integrate with enterprise monitoring systems
      // - Send to SIEM
      // - Send to security teams
      // - Create tickets
      // - Send to webhook endpoints

      console.log(
        `🚨 Security Alert: ${violation.category} - ${violation.message}`,
      );
    } catch (error) {
      console.error(
        `Failed to send security alert: ${(error as Error).message}`,
      );
    }
  }

  /**
   * 📊 Get current compliance status and statistics
   */
  getComplianceStatus(): Record<string, any> {
    return {
      configLoaded: true,
      configFile: this.configPath,
      violationsCount: this.violations.length,
      lastViolation:
        this.violations.length > 0
          ? this.violations[this.violations.length - 1]
          : null,
      rulesEnforced: [
        "network_access",
        "file_access",
        "tool_usage",
        "content_filtering",
        "env_var_access",
        "model_usage",
      ],
      securityStats: {
        networkRules: this.networkAllowSet.size + this.networkBlockSet.size,
        allowedTools: this.allowedToolsSet.size,
        contentPatterns:
          this.inputBlockPatterns.length + this.outputBlockPatterns.length,
        cacheSize: this.networkCache.size + this.contentCache.size,
      },
    };
  }

  /**
   * Get recent violations
   */
  getViolations(category?: string, limit: number = 100): ComplianceViolation[] {
    let violations = this.violations;

    if (category) {
      violations = violations.filter((v) => v.category === category);
    }

    return limit > 0 ? violations.slice(-limit) : violations;
  }

  /**
   * Clear violation log
   */
  clearViolations(): void {
    this.violations = [];
    this.networkCache.clear();
    this.contentCache.clear();
  }

  // ==================== PERFORMANCE OPTIMIZATIONS ====================

  /**
   * Set cache value with size limit
   */
  private setCacheValue<K, V>(cache: Map<K, V>, key: K, value: V): void {
    if (cache.size >= this.maxCacheSize) {
      // Remove oldest entries (simple FIFO)
      const keysToDelete = Array.from(cache.keys()).slice(
        0,
        Math.floor(this.maxCacheSize * 0.2),
      );
      keysToDelete.forEach((k) => cache.delete(k));
    }
    cache.set(key, value);
  }

  /**
   * Pre-warm caches with common operations
   */
  preWarmCaches(): void {
    // Pre-warm network cache with common domains
    const commonDomains = [
      "https://api.openai.com",
      "https://api.anthropic.com",
      "https://registry.sekuire.ai",
    ];

    commonDomains.forEach((domain) => {
      try {
        this.checkNetworkAccess(domain);
      } catch {
        // Ignore errors during pre-warm
      }
    });
  }
}

// ==================== DEFAULT EXPORT ====================

export default ComplianceMonitor;
