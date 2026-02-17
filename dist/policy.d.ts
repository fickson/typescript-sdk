export interface ActivePolicy {
    policy_id: string;
    workspace_id: string;
    version: string;
    status: string;
    hash: string;
    content: any;
    activated_at?: string;
    updated_at?: string;
    signature?: string;
    signing_key_id?: string;
    signing_public_key?: string;
}
export declare class PolicyClient {
    private readonly baseUrl;
    private cache;
    constructor(baseUrl: string);
    invalidateCache(workspaceId: string): void;
    fetchActivePolicy(workspaceId: string): Promise<ActivePolicy>;
    verify(policy: ActivePolicy): void;
}
