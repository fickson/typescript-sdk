import { PolicyClient } from "./policy";
import type { PolicyDecision } from "./types/policy";
export declare class PolicyGateway {
    private policyClient;
    private workspaceId;
    private enforcer;
    private cachedPolicyHash;
    constructor(policyClient: PolicyClient, workspaceId: string);
    initialize(): Promise<void>;
    checkRateLimit(type: "request" | "token", count?: number): PolicyDecision;
    checkCapability(capability: string): PolicyDecision;
    onHeartbeatResponse(policyHash: string | null): Promise<void>;
}
