import { PolicyClient } from "./policy";
import { PolicyEnforcer } from "./policy-enforcer";
import { PolicyViolationError } from "./types";
import type { PolicyDecision } from "./types/policy";

export class PolicyGateway {
  private enforcer: PolicyEnforcer | null = null;
  private cachedPolicyHash: string | null = null;

  constructor(
    private policyClient: PolicyClient,
    private workspaceId: string,
  ) {}

  async initialize(): Promise<void> {
    try {
      const policy = await this.policyClient.fetchActivePolicy(this.workspaceId);
      this.enforcer = new PolicyEnforcer(policy);
      this.cachedPolicyHash = policy.hash;
    } catch (err: unknown) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404) {
        this.enforcer = null;
        this.cachedPolicyHash = null;
        return;
      }
      console.warn("[PolicyGateway] Failed to fetch policy, running without enforcement:", err);
      this.enforcer = null;
      this.cachedPolicyHash = null;
    }
  }

  checkRateLimit(type: "request" | "token", count?: number): PolicyDecision {
    if (!this.enforcer) {
      return { allowed: true, violations: [], warnings: [] };
    }

    try {
      this.enforcer.enforceRateLimit(type, count);
      return { allowed: true, violations: [], warnings: [] };
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        return {
          allowed: false,
          violations: [{
            rule_id: err.rule,
            rule_name: err.rule,
            message: err.message,
            capability: `rate_limit.${type}`,
          }],
          warnings: [],
        };
      }
      throw err;
    }
  }

  checkCapability(capability: string): PolicyDecision {
    if (!this.enforcer) {
      return { allowed: true, violations: [], warnings: [] };
    }

    try {
      this.enforcer.enforceTool(capability);
      return { allowed: true, violations: [], warnings: [] };
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        return {
          allowed: false,
          violations: [{
            rule_id: err.rule,
            rule_name: err.rule,
            message: err.message,
            capability,
          }],
          warnings: [],
        };
      }
      throw err;
    }
  }

  async onHeartbeatResponse(policyHash: string | null): Promise<void> {
    if (policyHash === this.cachedPolicyHash) return;

    if (!policyHash) {
      this.enforcer = null;
      this.cachedPolicyHash = null;
      this.policyClient.invalidateCache(this.workspaceId);
      return;
    }

    try {
      this.policyClient.invalidateCache(this.workspaceId);
      const policy = await this.policyClient.fetchActivePolicy(this.workspaceId);
      this.enforcer = new PolicyEnforcer(policy);
      this.cachedPolicyHash = policy.hash;
    } catch (err) {
      console.error("[PolicyGateway] Failed to refresh policy (keeping stale enforcer):", err);
    }
  }
}
