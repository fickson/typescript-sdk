import { SekuireCrypto } from "./crypto";
import { HttpClient } from "./http";
import {
  type AgentResponse,
  type DisputeRequest,
  type Manifest,
  ProtocolError,
  type ReputationResponse,
  type VerificationStatus,
} from "./types";

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

export class SekuireRegistryClient {
  private readonly http: HttpClient;

  constructor(config: RegistryClientConfig | string, authToken?: string) {
    const cfg = typeof config === "string" ? { apiUrl: config } : config;
    this.http = new HttpClient({
      baseUrl: cfg.apiUrl,
      timeout: cfg.timeout,
      retries: cfg.retries,
      apiKey: cfg.apiKey || process.env.SEKUIRE_API_KEY,
      authToken,
    });
  }

  setAuthToken(token: string): void {
    this.http.setAuthToken(token);
  }

  setApiKey(apiKey: string): void {
    this.http.setApiKey(apiKey);
  }

  async publishAgent(options: PublishAgentOptions): Promise<PublishResponse> {
    const { manifest, privateKeyHex, systemPrompt, tools, publisherOrgId, visibility } = options;

    const sekuireId = SekuireCrypto.calculateSekuireId({
      model: manifest.identity.model,
      systemPrompt,
      tools,
      projectName: manifest.project.name,
      projectVersion: manifest.project.version,
    });

    const signature = SekuireCrypto.sign(sekuireId, privateKeyHex);

    const publicKeyBytes = SekuireCrypto.hexToBytes(privateKeyHex).slice(32);
    const publicKey = SekuireCrypto.bytesToHex(publicKeyBytes);

    const payload = {
      manifest,
      sekuireId,
      signature,
      publicKey,
      systemPromptHash: SekuireCrypto.hash(systemPrompt),
      toolsHash: SekuireCrypto.hash(tools),
      publisherOrgId,
      visibility: visibility || "public",
    };

    return this.http.post<PublishResponse>("/api/v1/publish", payload);
  }

  async getAgent(sekuireId: string): Promise<AgentResponse> {
    return this.http.get<AgentResponse>(`/api/v1/agents/${sekuireId}`);
  }

  async updateAgent(sekuireId: string, options: UpdateAgentOptions): Promise<AgentResponse> {
    return this.http.put<AgentResponse>(`/api/v1/agents/${sekuireId}`, options);
  }

  async deleteAgent(sekuireId: string): Promise<void> {
    await this.http.delete(`/api/v1/agents/${sekuireId}/delete`);
  }

  async listAgents(options?: SearchAgentsOptions): Promise<AgentResponse[]> {
    const params: Record<string, string | number | boolean | undefined> = {};

    if (options?.query) params.q = options.query;
    if (options?.tags?.length) params.tags = options.tags.join(",");
    if (options?.verificationStatus) params.verification_status = options.verificationStatus;
    if (options?.category) params.category = options.category;
    if (options?.limit) params.limit = options.limit;
    if (options?.offset) params.offset = options.offset;

    const response = await this.http.get<{ agents: AgentResponse[] }>("/api/v1/agents", params);
    return response.agents || [];
  }

  async searchAgents(query: string, options?: Omit<SearchAgentsOptions, "query">): Promise<AgentResponse[]> {
    return this.listAgents({ ...options, query });
  }

  async getMyAgents(): Promise<AgentResponse[]> {
    const response = await this.http.get<{ agents: AgentResponse[] }>("/api/v1/agents/me");
    return response.agents || [];
  }

  async getReputation(sekuireId: string): Promise<ReputationResponse> {
    return this.http.get<ReputationResponse>(`/api/v1/agents/${sekuireId}/reputation`);
  }

  async recordTaskCompletion(
    sekuireId: string,
    task: TaskCompletion,
    privateKeyHex: string,
  ): Promise<void> {
    const payload = {
      sekuireId,
      taskHash: task.taskHash,
      rating: task.rating,
      comment: task.comment,
      signature: SekuireCrypto.sign(
        `${sekuireId}:${task.taskHash}:${task.rating}`,
        privateKeyHex,
      ),
    };

    await this.http.post("/api/v1/tasks/complete", payload);
  }

  async getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
    const response = await this.http.get<{ entries: LeaderboardEntry[] }>(
      "/api/v1/leaderboard",
      { limit },
    );
    return response.entries || [];
  }

  async fileDispute(
    sekuireId: string,
    reason: string,
    evidenceLog: string,
    accuserId: string,
  ): Promise<DisputeResponse> {
    const payload: DisputeRequest = {
      sekuireId,
      accuserId,
      reason,
      evidenceLog,
    };

    return this.http.post<DisputeResponse>("/api/v1/disputes", payload);
  }

  async verifyAgentQuick(sekuireId: string): Promise<VerificationResult> {
    return this.http.post<VerificationResult>("/api/v1/verify-agent", { sekuireId });
  }

  async verifyAgentComprehensive(request: VerificationRequest): Promise<VerificationResult> {
    return this.http.post<VerificationResult>("/api/v1/agents/verify/comprehensive", request);
  }

  async getVerificationHistory(sekuireId: string): Promise<VerificationResult[]> {
    const response = await this.http.get<{ verifications: VerificationResult[] }>(
      `/api/v1/agents/${sekuireId}/verifications`,
    );
    return response.verifications || [];
  }

  async getLatestVerification(sekuireId: string): Promise<VerificationResult | null> {
    try {
      return await this.http.get<VerificationResult>(
        `/api/v1/agents/${sekuireId}/verification`,
      );
    } catch (error) {
      if (error instanceof ProtocolError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  async generateTrustHeaders(request: TrustHeadersRequest): Promise<TrustHeaders> {
    return this.http.post<TrustHeaders>("/api/v1/trust/headers", request);
  }

  async getTrustProfile(agentDid: string): Promise<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`/api/v1/trust/profile/${agentDid}`);
  }

  async getTransactionHistory(agentDid: string): Promise<unknown[]> {
    const response = await this.http.get<{ transactions: unknown[] }>(
      `/api/v1/trust/transactions/${agentDid}`,
    );
    return response.transactions || [];
  }

  async createTask(task: {
    description: string;
    capabilities: string[];
    priority?: number;
    callbackUrl?: string;
  }): Promise<{ taskId: string; status: string }> {
    return this.http.post("/api/v1/tasks", task);
  }

  async getTask(taskId: string): Promise<{
    taskId: string;
    status: string;
    result?: unknown;
    error?: string;
  }> {
    return this.http.get(`/api/v1/tasks/${taskId}`);
  }

  async completeTask(
    taskId: string,
    result: unknown,
    privateKeyHex: string,
  ): Promise<void> {
    const signature = SekuireCrypto.sign(
      `task:${taskId}:complete`,
      privateKeyHex,
    );

    await this.http.post(`/api/v1/tasks/${taskId}/complete`, {
      result,
      signature,
    });
  }

  async getRegistryStats(): Promise<{
    totalAgents: number;
    verifiedAgents: number;
    totalTasks: number;
    categories: string[];
  }> {
    return this.http.get("/api/v1/agents/stats");
  }

  async getCategories(): Promise<Array<{ slug: string; name: string; agentCount: number }>> {
    return this.http.get("/api/v1/categories");
  }

  async getAgentsByCategory(categorySlug: string): Promise<AgentResponse[]> {
    const response = await this.http.get<{ agents: AgentResponse[] }>(
      `/api/v1/categories/${categorySlug}/agents`,
    );
    return response.agents || [];
  }

  async getWorkspace(workspaceId: string): Promise<Record<string, unknown>> {
    return this.http.get(`/api/v1/workspaces/${workspaceId}`);
  }

  async getWorkspacePolicies(workspaceId: string): Promise<unknown[]> {
    const response = await this.http.get<{ policies: unknown[] }>(
      `/api/v1/workspaces/${workspaceId}/policies`,
    );
    return response.policies || [];
  }

  async getActivePolicy(workspaceId: string): Promise<unknown> {
    return this.http.get(`/api/v1/workspaces/${workspaceId}/policy/active`);
  }

  async getPolicyTemplates(): Promise<unknown[]> {
    const response = await this.http.get<{ templates: unknown[] }>("/api/v1/policies/templates");
    return response.templates || [];
  }

  async evaluatePolicy(
    workspaceId: string,
    action: { type: string; resource: string; context?: Record<string, unknown> },
  ): Promise<{ allowed: boolean; violations: string[] }> {
    return this.http.post("/api/v1/policies/evaluate", {
      workspaceId,
      action,
    });
  }

  async logAgentEvents(
    sekuireId: string,
    events: Array<{
      type: string;
      severity: string;
      data: Record<string, unknown>;
      timestamp?: string;
    }>,
  ): Promise<void> {
    await this.http.post(`/api/v1/agents/${sekuireId}/logs/batch`, { events });
  }

  async logAgentHealth(
    sekuireId: string,
    health: {
      status: "healthy" | "degraded" | "unhealthy";
      uptime: number;
      memoryMb?: number;
      cpuPercent?: number;
    },
  ): Promise<void> {
    await this.http.post(`/api/v1/agents/${sekuireId}/logs/health`, health);
  }

  async getAgentLogs(
    sekuireId: string,
    options?: { limit?: number; offset?: number; type?: string },
  ): Promise<unknown[]> {
    const response = await this.http.get<{ logs: unknown[] }>(
      `/api/v1/agents/${sekuireId}/logs`,
      options,
    );
    return response.logs || [];
  }
}

export function createRegistryClient(
  apiUrl: string,
  authToken?: string,
  apiKey?: string,
): SekuireRegistryClient {
  return new SekuireRegistryClient({ apiUrl, apiKey }, authToken);
}
