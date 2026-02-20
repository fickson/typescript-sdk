import type { ActivePolicy } from "./policy";
type ViolationHandler = (rule: string, reason: string) => void;
export declare class PolicyEnforcer {
    private readonly policy;
    private readonly onViolation?;
    private readonly override;
    private rateLimitWindows;
    constructor(policy: ActivePolicy, override?: boolean, onViolation?: ViolationHandler | undefined);
    enforceNetwork(domain: string, protocol: string): void;
    enforceFilesystem(path: string, operation: string): void;
    enforceTool(toolName: string): void;
    private matchesCategoryPattern;
    private toolMatchesCategory;
    private toolMatchesCategoryOperation;
    enforceModel(model: string): void;
    enforceApi(service: string): void;
    enforceRateLimit(type: "request" | "token", count?: number): void;
    private checkWindow;
    private cleanupStaleWindows;
    private throw;
    private warnOnly;
    private matches;
    private pathMatch;
}
export {};
