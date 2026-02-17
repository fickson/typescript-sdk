import { type AgentResponse, type Manifest, type ReputationResponse, type VerificationStatus } from "./types";
export interface RegistryClientConfig {
    apiUrl: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
}
export interface PublishAgentOptions {
    manifest: Manifest;
    privateKeyHex: string;
    systemPrompt: string;
    tools: string;
    publisherOrgId?: string;
    visibility?: "public" | "private" | "internal";
}
export interface UpdateAgentOptions {
    manifest?: Partial<Manifest>;
    visibility?: "public" | "private" | "internal";
    gitRepository?: string;
}
export interface SearchAgentsOptions {
    query?: string;
    tags?: string[];
    verificationStatus?: VerificationStatus;
    category?: string;
    limit?: number;
    offset?: number;
}
export interface TaskCompletion {
    taskId: string;
    taskHash: string;
    rating: number;
    comment?: string;
    evidence?: string;
}
export interface LeaderboardEntry {
    sekuireId: string;
    name: string;
    reputationScore: number;
    taskCount: number;
    verificationStatus: VerificationStatus;
    rank: number;
}
export interface PublishResponse {
    sekuireId: string;
    name: string;
    version: string;
    verificationStatus: VerificationStatus;
    createdAt: string;
}
export interface DisputeResponse {
    id: string;
    sekuireId: string;
    status: "pending" | "reviewing" | "resolved" | "rejected";
    createdAt: string;
}
export interface VerificationRequest {
    sekuireId: string;
    repositoryUrl?: string;
    commitHash?: string;
    complianceFramework?: string;
}
export interface VerificationResult {
    passed: boolean;
    securityScore: number;
    complianceScore: number;
    issues: VerificationIssue[];
    timestamp: string;
}
export interface VerificationIssue {
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    message: string;
    file?: string;
    line?: number;
}
export interface TrustHeadersRequest {
    agentId: string;
    action?: string;
    context?: Record<string, unknown>;
}
export interface TrustHeaders {
    "X-Sekuire-Agent-ID": string;
    "X-Sekuire-Reputation": string;
    "X-Sekuire-Verification": string;
    "X-Sekuire-Badges": string;
    "X-Sekuire-Timestamp": string;
    "X-Sekuire-Signature": string;
}
export declare class SekuireRegistryClient {
    private readonly http;
    constructor(config: RegistryClientConfig | string, authToken?: string);
    setAuthToken(token: string): void;
    setApiKey(apiKey: string): void;
    publishAgent(options: PublishAgentOptions): Promise<PublishResponse>;
    getAgent(sekuireId: string): Promise<AgentResponse>;
    updateAgent(sekuireId: string, options: UpdateAgentOptions): Promise<AgentResponse>;
    deleteAgent(sekuireId: string): Promise<void>;
    listAgents(options?: SearchAgentsOptions): Promise<AgentResponse[]>;
    searchAgents(query: string, options?: Omit<SearchAgentsOptions, "query">): Promise<AgentResponse[]>;
    getMyAgents(): Promise<AgentResponse[]>;
    getReputation(sekuireId: string): Promise<ReputationResponse>;
    recordTaskCompletion(sekuireId: string, task: TaskCompletion, privateKeyHex: string): Promise<void>;
    getLeaderboard(limit?: number): Promise<LeaderboardEntry[]>;
    fileDispute(sekuireId: string, reason: string, evidenceLog: string, accuserId: string): Promise<DisputeResponse>;
    verifyAgentQuick(sekuireId: string): Promise<VerificationResult>;
    verifyAgentComprehensive(request: VerificationRequest): Promise<VerificationResult>;
    getVerificationHistory(sekuireId: string): Promise<VerificationResult[]>;
    getLatestVerification(sekuireId: string): Promise<VerificationResult | null>;
    generateTrustHeaders(request: TrustHeadersRequest): Promise<TrustHeaders>;
    getTrustProfile(agentDid: string): Promise<Record<string, unknown>>;
    getTransactionHistory(agentDid: string): Promise<unknown[]>;
    createTask(task: {
        description: string;
        capabilities: string[];
        priority?: number;
        callbackUrl?: string;
    }): Promise<{
        taskId: string;
        status: string;
    }>;
    getTask(taskId: string): Promise<{
        taskId: string;
        status: string;
        result?: unknown;
        error?: string;
    }>;
    completeTask(taskId: string, result: unknown, privateKeyHex: string): Promise<void>;
    getRegistryStats(): Promise<{
        totalAgents: number;
        verifiedAgents: number;
        totalTasks: number;
        categories: string[];
    }>;
    getCategories(): Promise<Array<{
        slug: string;
        name: string;
        agentCount: number;
    }>>;
    getAgentsByCategory(categorySlug: string): Promise<AgentResponse[]>;
    getWorkspace(workspaceId: string): Promise<Record<string, unknown>>;
    getWorkspacePolicies(workspaceId: string): Promise<unknown[]>;
    getActivePolicy(workspaceId: string): Promise<unknown>;
    getPolicyTemplates(): Promise<unknown[]>;
    evaluatePolicy(workspaceId: string, action: {
        type: string;
        resource: string;
        context?: Record<string, unknown>;
    }): Promise<{
        allowed: boolean;
        violations: string[];
    }>;
    logAgentEvents(sekuireId: string, events: Array<{
        type: string;
        severity: string;
        data: Record<string, unknown>;
        timestamp?: string;
    }>): Promise<void>;
    logAgentHealth(sekuireId: string, health: {
        status: "healthy" | "degraded" | "unhealthy";
        uptime: number;
        memoryMb?: number;
        cpuPercent?: number;
    }): Promise<void>;
    getAgentLogs(sekuireId: string, options?: {
        limit?: number;
        offset?: number;
        type?: string;
    }): Promise<unknown[]>;
}
export declare function createRegistryClient(apiUrl: string, authToken?: string, apiKey?: string): SekuireRegistryClient;
