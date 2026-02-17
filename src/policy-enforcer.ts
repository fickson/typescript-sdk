import type { ToolDefinition } from "./config/loader";
import type { ActivePolicy } from "./policy";
import { PolicyViolationError } from "./types";

type ViolationHandler = (rule: string, reason: string) => void;

const DEFAULT_OVERRIDE_ENV = "SEKUIRE_POLICY_DEV_OVERRIDE";

export class PolicyEnforcer {
  private readonly override: boolean;
  private rateLimitWindows: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(
    private readonly policy: ActivePolicy,
    override?: boolean,
    private readonly onViolation?: ViolationHandler,
  ) {
    const envOverride = process.env[DEFAULT_OVERRIDE_ENV] === "true";
    this.override = override ?? envOverride;
    if (this.override) {
      console.warn(
        "[policy] override enabled; policy enforcement is running in warn-only mode",
      );
    }
  }

  enforceNetwork(domain: string, protocol: string): void {
    const perms = this.policy.content?.permissions?.network;
    if (!perms) {
      this.warnOnly("network.missing", "Network permissions not configured");
      return;
    }
    if (!perms.enabled)
      this.throw("network.disabled", "Network access is disabled");
    if (perms.require_tls && protocol !== "https") {
      this.throw(
        "network.tls_required",
        "TLS is required for network requests",
      );
    }
    if (perms.blocked_domains && this.matches(domain, perms.blocked_domains)) {
      this.throw("network.blocked", `Domain ${domain} is blocked by policy`);
    }
    if (perms.allowed_domains && !this.matches(domain, perms.allowed_domains)) {
      this.throw(
        "network.not_allowed",
        `Domain ${domain} is not in the allowlist`,
      );
    }
  }

  enforceFilesystem(path: string, operation: string): void {
    const perms = this.policy.content?.permissions?.filesystem;
    if (!perms) {
      this.warnOnly("fs.missing", "Filesystem permissions not configured");
      return;
    }
    if (!perms.enabled)
      this.throw("fs.disabled", "Filesystem access is disabled");
    if (perms.blocked_paths && this.pathMatch(path, perms.blocked_paths)) {
      this.throw("fs.blocked", `Path ${path} is blocked`);
    }
    if (perms.allowed_paths && !this.pathMatch(path, perms.allowed_paths)) {
      this.throw("fs.not_allowed", `Path ${path} is not in the allowlist`);
    }
    if (perms.allowed_extensions) {
      const ext = path.includes(".") ? `.${path.split(".").pop()}` : "";
      if (ext && !perms.allowed_extensions.includes(ext)) {
        this.throw("fs.ext", `Extension ${ext} is not allowed`);
      }
    }
  }

  enforceTool(toolName: string): void {
    const tools = this.policy.content?.tools;

    
    // Check blocked tools
    if (tools?.blocked_tools?.includes(toolName)) {
      this.throw("tool.blocked", `Tool ${toolName} is blocked`);
    }
    
    // If no allowlist, allow all tools
    if (!tools?.allowed_tools || tools.allowed_tools.length === 0) {

      return;
    }
    
    // Check allowlist with pattern matching
    const isAllowed = tools.allowed_tools.some((t: ToolDefinition) => {
      const pattern = t.name;

      
      // Exact match
      if (pattern === toolName) {

        return true;
      }
      
      // Category patterns: "files:*" => matches "file_read", "file_write", etc
      // Check this BEFORE wildcard matching since it contains both : and *
      if (pattern.includes(":")) {
        const [category, ops] = pattern.split(":", 2);
        const categoryPrefix = this.getCategoryPrefix(category);

        
        if (ops === "*") {
          // Match all tools in category
          const matches = toolName.startsWith(categoryPrefix + "_");

          return matches;
        }
        
        if (ops.startsWith("[") && ops.endsWith("]")) {
          // Match specific operations: "files:[read,write]"
          const operations = ops.slice(1, -1).split(",").map(s => s.trim());
          const matches = operations.some(op => toolName === `${categoryPrefix}_${op}`);
          console.log(`[DEBUG]   ${matches ? '✓' : '✗'} Category ops: ${operations.join(",")}`);
          return matches;
        }
      }
      
      // Pattern matching: "file_*", etc (simple wildcards without :)
      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        const matches = regex.test(toolName);

        return matches;
      }
      
      return false;
    });
    
    if (!isAllowed) {
      this.throw(
        "tool.not_allowed",
        `Tool ${toolName} is not in the allowlist`,
      );
    }
  }
  
  private getCategoryPrefix(category: string): string {
    const prefixMap: Record<string, string> = {
      files: "file",
      directories: "dir",
      network: "http",
      data: "json",
      system: "env",
    };
    return prefixMap[category] || category;
  }

  enforceModel(model: string): void {
    const models = this.policy.content?.agent?.models;
    if (models?.allowed_models && !models.allowed_models.includes(model)) {
      this.throw("model.not_allowed", `Model ${model} is not allowed`);
    }
    if (models?.blocked_models && models.blocked_models.includes(model)) {
      this.throw("model.blocked", `Model ${model} is blocked`);
    }
  }

  enforceApi(service: string): void {
    const perms = this.policy.content?.permissions?.api;
    if (!perms) {
      this.warnOnly("api.missing", "API permissions not configured");
      return;
    }
    if (!perms.enabled) this.throw("api.disabled", "API access is disabled");
    if (
      perms.allowed_services &&
      !perms.allowed_services.some(
        (s: { service_name: string }) => s.service_name === service,
      )
    ) {
      this.throw(
        "api.not_allowed",
        `API service ${service} is not in the allowlist`,
      );
    }
  }

  enforceRateLimit(type: "request" | "token", count: number = 1): void {
    const limits = this.policy.content?.rate_limits?.per_agent;
    if (!limits) return;

    const now = Date.now();
    this.cleanupStaleWindows(now);

    if (type === "request") {
      if (limits.requests_per_minute) {
        this.checkWindow(`req_60`, 60_000, limits.requests_per_minute, count, now);
      }
      if (limits.requests_per_hour) {
        this.checkWindow(`req_3600`, 3_600_000, limits.requests_per_hour, count, now);
      }
    }

    if (type === "token" && limits.tokens_per_minute) {
      this.checkWindow(`tok_60`, 60_000, limits.tokens_per_minute, count, now);
    }
  }

  private checkWindow(key: string, windowMs: number, limit: number, count: number, now: number): void {
    let entry = this.rateLimitWindows.get(key);
    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      this.rateLimitWindows.set(key, entry);
    }
    entry.count += count;
    if (entry.count > limit) {
      this.throw("rate_limit.exceeded", `Rate limit exceeded: ${key} (${entry.count}/${limit})`);
    }
  }

  private cleanupStaleWindows(now: number): void {
    for (const [key, entry] of this.rateLimitWindows) {
      const windowMs = key.includes("3600") ? 3_600_000 : 60_000;
      if (now - entry.windowStart >= windowMs * 2) {
        this.rateLimitWindows.delete(key);
      }
    }
  }

  private throw(rule: string, reason: string): void {
    if (this.override) {
      this.warnOnly(rule, reason);
      return;
    }
    if (this.onViolation) this.onViolation(rule, reason);
    throw new PolicyViolationError(reason, rule);
  }

  private warnOnly(rule: string, reason: string): void {
    if (this.onViolation) this.onViolation(rule, reason);
    console.warn(`[policy][${rule}] ${reason}`);
  }

  private matches(domain: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.startsWith("*.")) {
        const suffix = pattern.slice(2);
        return domain === suffix || domain.endsWith(`.${suffix}`);
      }
      return domain === pattern;
    });
  }

  private pathMatch(path: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -2);
        return path.startsWith(prefix);
      }
      if (pattern.endsWith("*")) {
        const prefix = pattern.slice(0, -1);
        return path.startsWith(prefix);
      }
      if (pattern.endsWith("/")) {
        return path.startsWith(pattern) || path === pattern.slice(0, -1);
      }
      return path === pattern || path.startsWith(pattern + "/");
    });
  }
}
