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
    const isProduction = process.env.NODE_ENV === "production";
    const requestedOverride = override ?? envOverride;

    if (requestedOverride && isProduction) {
      console.error(
        "[policy] SEKUIRE_POLICY_DEV_OVERRIDE is ignored in production (NODE_ENV=production). " +
        "Policy enforcement is active.",
      );
      this.override = false;
    } else {
      this.override = requestedOverride;
    }

    if (this.override) {
      console.warn(
        "[policy] override enabled; policy enforcement is running in warn-only mode. " +
        "This MUST NOT be used in production.",
      );
    }

    Object.freeze(this.policy);
    if (this.policy.content) {
      Object.freeze(this.policy.content);
    }
  }

  enforceNetwork(domain: string, protocol: string): void {
    const perms = this.policy.content?.permissions?.network;
    if (!perms) {
      this.warnOnly("network.missing", "Network permissions not configured - defaulting to allow. Configure permissions.network in sekuire.yml for enforcement.");
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
      this.warnOnly("fs.missing", "Filesystem permissions not configured - defaulting to allow. Configure permissions.filesystem in sekuire.yml for enforcement.");
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

    if (tools?.blocked_tools?.includes(toolName)) {
      this.throw("tool.blocked", `Tool ${toolName} is blocked`);
    }

    if (!tools?.allowed_tools || tools.allowed_tools.length === 0) {
      return;
    }

    const isAllowed = tools.allowed_tools.some((t: ToolDefinition) => {
      const pattern = t.name;

      if (pattern === toolName) {
        return true;
      }

      if (pattern.includes(":")) {
        const [category, ops] = pattern.split(":", 2);
        return this.matchesCategoryPattern(category, ops, toolName);
      }

      if (pattern.includes("*")) {
        const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
        return regex.test(toolName);
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

  private matchesCategoryPattern(category: string, ops: string, toolName: string): boolean {
    const normalizedCategory = category.trim().toLowerCase();

    if (ops === "*") {
      return this.toolMatchesCategory(normalizedCategory, toolName);
    }

    if (ops.startsWith("[") && ops.endsWith("]")) {
      const operations = ops
        .slice(1, -1)
        .split(",")
        .map((op) => op.trim())
        .filter((op) => op.length > 0);

      return operations.some((op) =>
        this.toolMatchesCategoryOperation(normalizedCategory, op, toolName),
      );
    }

    return this.toolMatchesCategoryOperation(normalizedCategory, ops.trim(), toolName);
  }

  private toolMatchesCategory(category: string, toolName: string): boolean {
    switch (category) {
      case "files":
        return toolName.startsWith("file_");
      case "directories":
        return toolName.startsWith("dir_");
      case "network":
        return (
          toolName.startsWith("http_") ||
          toolName === "download_file" ||
          toolName === "dns_lookup" ||
          toolName === "ping" ||
          toolName === "web_search"
        );
      case "data":
        return (
          toolName.startsWith("json_") ||
          toolName.startsWith("csv_") ||
          toolName.startsWith("yaml_") ||
          toolName.startsWith("xml_") ||
          toolName.startsWith("base64_") ||
          toolName === "hash"
        );
      case "system":
        return (
          toolName.startsWith("env_") ||
          toolName === "get_cwd" ||
          toolName === "get_platform"
        );
      default:
        return toolName.startsWith(`${category}_`);
    }
  }

  private toolMatchesCategoryOperation(
    category: string,
    operation: string,
    toolName: string,
  ): boolean {
    const op = operation.trim().toLowerCase();

    if (!op) return false;

    switch (category) {
      case "files":
        return toolName === `file_${op}`;
      case "directories":
        return toolName === `dir_${op}`;
      case "network":
        if (op === "search") return toolName === "web_search";
        if (op === "download") return toolName === "download_file";
        if (op === "dns") return toolName === "dns_lookup";
        return toolName === `http_${op}` || toolName === op;
      case "data":
        if (op === "hash") return toolName === "hash";
        if (op.startsWith("json_")) return toolName === op;
        if (op.startsWith("csv_")) return toolName === op;
        if (op.startsWith("yaml_")) return toolName === op;
        if (op.startsWith("xml_")) return toolName === op;
        if (op.startsWith("base64_")) return toolName === op;
        return toolName === `json_${op}` || toolName === op;
      case "system":
        if (op === "cwd") return toolName === "get_cwd";
        if (op === "platform") return toolName === "get_platform";
        if (op === "get" || op === "set") return toolName === `env_${op}`;
        return toolName === `env_${op}` || toolName === op;
      default:
        return toolName === `${category}_${op}` || toolName === op;
    }
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
      this.warnOnly("api.missing", "API permissions not configured - defaulting to allow. Configure permissions.api in sekuire.yml for enforcement.");
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

  isOverrideEnabled(): boolean {
    return this.override;
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
