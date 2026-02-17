export interface ActivePolicyResponse {
  policy_id: string;
  workspace_id: string;
  version: string;
  status: string;
  hash: string;
  content: unknown;
  activated_at?: string;
  updated_at?: string;
  signature?: string;
  signing_key_id?: string;
  signing_public_key?: string;
}

export interface CustomRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  priority?: number;
  scope: { capabilities: string[]; agents?: string[] };
  conditions: RuleCondition[];
  logic: "any" | "all";
  action: "deny" | "warn";
  message: string;
}

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
  case_sensitive?: boolean;
}

export type ConditionOperator =
  | "contains" | "not_contains"
  | "equals" | "not_equals"
  | "starts_with" | "ends_with"
  | "matches"
  | "in" | "not_in"
  | "greater_than" | "less_than";

export interface PolicyDecision {
  allowed: boolean;
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
}

export interface PolicyViolation {
  rule_id: string;
  rule_name: string;
  message: string;
  capability: string;
}

export interface RateLimitsConfig {
  per_agent?: PerAgentLimits;
}

export interface PerAgentLimits {
  requests_per_minute?: number;
  requests_per_hour?: number;
  tokens_per_minute?: number;
}
