/**
 * SekuireSDK - Main SDK entry point for TypeScript agents
 *
 * Combines identity, logging, and heartbeat functionality with a simple API.
 */

import axios, { type AxiosInstance } from "axios";
import { A2ATaskDelegator } from "./a2a-delegator";
import { Beacon, type BeaconStatus, type InstallationCredentials } from "./beacon";
import { AgentIdentity } from "./identity";
import { SekuireLogger, type LoggerConfig, type EventType, type Severity } from "./logger";
import { detectDeploymentUrl } from "./platform-url";
import { PolicyClient } from "./policy";
import { PolicyGateway } from "./policy-gateway";
import { RuntimeCredentialsStore } from "./runtime-credentials";
import { TaskWorker, type WorkerConfig, type TaskHandler } from "./worker";

export const DEFAULT_API_URL = "https://api.sekuire.ai";

export interface SekuireSDKConfig {
  privateKey?: string;
  agentId: string;
  agentName?: string;
  apiUrl?: string;
  apiKey?: string;
  /** Install token from dashboard (preferred for BYOC deployments) */
  installToken?: string;
  workspaceId?: string;
  environment?: string;
  autoHeartbeat?: boolean;
  /** Heartbeat interval in seconds (default: 60) */
  heartbeatIntervalSeconds?: number;
  loggingEnabled?: boolean;
  /** Capabilities this agent provides */
  capabilities?: string[];
  /**
   * Pre-existing installation ID for credential recovery.
   * When set with refreshToken, allows recovery after container restarts.
   * Reads from SEKUIRE_INSTALLATION_ID if not set.
   */
  installationId?: string;
  /**
   * Refresh token for credential recovery.
   * Use with installationId to recover after container restarts.
   * Reads from SEKUIRE_REFRESH_TOKEN if not set.
   */
  refreshToken?: string;
  /**
   * Pre-existing runtime token (optional).
   * If still valid, skips refresh on startup.
   * Reads from SEKUIRE_RUNTIME_TOKEN if not set.
   */
  runtimeToken?: string;
}

export class SekuireSDK {
  private config: {
    privateKey?: string;
    apiKey?: string;
    installToken?: string;
    installationId?: string;
    refreshToken?: string;
    runtimeToken?: string;
    agentId: string;
    agentName: string;
    apiUrl: string;
    workspaceId: string;
    environment: string;
    autoHeartbeat: boolean;
    heartbeatIntervalSeconds: number;
    loggingEnabled: boolean;
    capabilities: string[];
  };
  private identity: AgentIdentity;
  private logger: SekuireLogger;
  private client: AxiosInstance;
  private beacon: Beacon;
  private isRunning = false;
  private credentialsStore: RuntimeCredentialsStore;
  private policyGateway: PolicyGateway | null = null;

  constructor(config: SekuireSDKConfig) {
    if (!config.agentId) {
      throw new Error("agentId is required");
    }

    const apiKey = config.apiKey || process.env.SEKUIRE_API_KEY;
    const installToken = config.installToken || process.env.SEKUIRE_INSTALL_TOKEN;
    const installationId = config.installationId || process.env.SEKUIRE_INSTALLATION_ID;
    const refreshToken = config.refreshToken || process.env.SEKUIRE_REFRESH_TOKEN;
    const runtimeToken = config.runtimeToken || process.env.SEKUIRE_RUNTIME_TOKEN;
    const hasRecoveryCredentials = !!(installationId && refreshToken);
    const hasAnyCredentials = !!(
      apiKey ||
      installToken ||
      runtimeToken ||
      hasRecoveryCredentials
    );

    this.config = {
      privateKey: config.privateKey,
      apiKey,
      installToken,
      installationId,
      refreshToken,
      runtimeToken,
      agentId: config.agentId,
      agentName: config.agentName ?? "Unknown",
      apiUrl: (config.apiUrl ?? DEFAULT_API_URL).replace(/\/$/, ""),
      workspaceId: config.workspaceId ?? "",
      environment: config.environment ?? "production",
      autoHeartbeat: config.autoHeartbeat !== false,
      heartbeatIntervalSeconds: config.heartbeatIntervalSeconds ?? 60,
      loggingEnabled: config.loggingEnabled !== false,
      capabilities: config.capabilities ?? [],
    };

    this.credentialsStore = new RuntimeCredentialsStore({
      installationId: this.config.installationId,
      refreshToken: this.config.refreshToken,
      runtimeToken: this.config.runtimeToken,
      apiBaseUrl: this.config.apiUrl,
    });

    this.identity = new AgentIdentity(
      this.config.agentName,
      this.config.agentId,
      this.config.privateKey,
    );

    const loggerApiBaseUrl =
      config.apiUrl !== undefined || hasAnyCredentials
        ? this.config.apiUrl
        : undefined;

    const loggerConfig: LoggerConfig = {
      sekuireId: this.config.agentId,
      apiBaseUrl: loggerApiBaseUrl,
      apiKey: this.config.apiKey,
      workspaceId: this.config.workspaceId || undefined,
      environment: this.config.environment,
      enabled: this.config.loggingEnabled,
    };
    this.logger = new SekuireLogger(loggerConfig);

    this.client = axios.create({
      baseURL: this.config.apiUrl,
      timeout: 10000,
      headers: this.config.apiKey ? { "X-API-Key": this.config.apiKey } : {},
    });

    this.beacon = new Beacon({
      apiBaseUrl: this.config.apiUrl,
      installToken: this.config.installToken,
      apiKey: this.config.apiKey,
      agentId: this.config.agentId,
      workspaceId: this.config.workspaceId || undefined,
      heartbeatIntervalSeconds: this.config.heartbeatIntervalSeconds,
      capabilities: this.config.capabilities,
      installationId: this.config.installationId,
      refreshToken: this.config.refreshToken,
      runtimeToken: this.config.runtimeToken,
      credentialsStore: this.credentialsStore,
    });
  }

  /**
   * Create SDK instance from environment variables.
   *
   * Required env vars:
   *   SEKUIRE_AGENT_ID - The agent's sekuire_id
   *
   * Authentication (one of the following):
   *   SEKUIRE_INSTALL_TOKEN - Install token from dashboard (for initial bootstrap)
   *   SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN - For credential recovery
   *
   * Optional env vars:
   *   SEKUIRE_API_KEY - API key for authentication (X-API-Key header)
   *   SEKUIRE_PRIVATE_KEY - Private key for signing
   *   SEKUIRE_AGENT_NAME - Human-readable agent name
   *   SEKUIRE_API_URL - API base URL (default: https://api.sekuire.ai)
   *   SEKUIRE_WORKSPACE_ID - Workspace ID for policy enforcement
   *   SEKUIRE_ENVIRONMENT - Environment name (default: production)
   *   SEKUIRE_RUNTIME_TOKEN - Pre-existing runtime token (skips refresh if valid)
   */
  static fromEnv(options?: {
    autoHeartbeat?: boolean;
    loggingEnabled?: boolean;
  }): SekuireSDK {
    const agentId = process.env.SEKUIRE_AGENT_ID;
    if (!agentId) {
      throw new Error("SEKUIRE_AGENT_ID environment variable is required");
    }

    return new SekuireSDK({
      privateKey: process.env.SEKUIRE_PRIVATE_KEY,
      apiKey: process.env.SEKUIRE_API_KEY,
      installToken: process.env.SEKUIRE_INSTALL_TOKEN,
      installationId: process.env.SEKUIRE_INSTALLATION_ID,
      refreshToken: process.env.SEKUIRE_REFRESH_TOKEN,
      runtimeToken: process.env.SEKUIRE_RUNTIME_TOKEN,
      agentId,
      agentName: process.env.SEKUIRE_AGENT_NAME,
      apiUrl: process.env.SEKUIRE_API_URL ?? DEFAULT_API_URL,
      workspaceId: process.env.SEKUIRE_WORKSPACE_ID,
      environment: process.env.SEKUIRE_ENVIRONMENT ?? "production",
      autoHeartbeat: options?.autoHeartbeat !== false,
      loggingEnabled: options?.loggingEnabled !== false,
    });
  }

  /**
   * Start the SDK.
   *
   * - Bootstraps with Sekuire using install token or recovery credentials
   * - Starts auto-heartbeat loop if enabled
   *
   * Authentication (one of):
   * - SEKUIRE_INSTALL_TOKEN for initial bootstrap
   * - SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN for recovery
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    const hasInstallToken = !!this.config.installToken;
    const hasRecoveryCredentials = !!(this.config.installationId && this.config.refreshToken);

    if (this.config.workspaceId) {
      try {
        const policyClient = new PolicyClient(this.config.apiUrl);
        this.policyGateway = new PolicyGateway(policyClient, this.config.workspaceId);
        await this.policyGateway.initialize();
      } catch {
        console.warn("[SekuireSDK] PolicyGateway initialization failed, running without enforcement");
        this.policyGateway = null;
      }
    }

    if (this.policyGateway) {
      this.beacon.setPolicyGateway(this.policyGateway);
    }

    if (this.config.autoHeartbeat && (hasInstallToken || hasRecoveryCredentials)) {
      await this.beacon.start();
    } else if (this.config.autoHeartbeat && !hasInstallToken && !hasRecoveryCredentials) {
      console.warn(
        "[SekuireSDK] Auto-heartbeat enabled but no credentials provided. Set one of:" +
        "\n  - SEKUIRE_INSTALL_TOKEN (for initial bootstrap)" +
        "\n  - SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN (for recovery)"
      );
    }
  }

  /**
   * Check if the beacon is connected and sending heartbeats.
   *
   * @returns True if the beacon has successfully bootstrapped
   */
  isConnected(): boolean {
    const status = this.beacon.getStatus();
    return status.isRunning && !!status.installationId;
  }

  /**
   * Log an event to Sekuire.
   *
   * @param eventType Type of event (tool_execution, model_call, policy_check, etc.)
   * @param data Event-specific data
   * @param severity Severity level (debug, info, warn, error)
   */
  log(
    eventType: EventType,
    data: Record<string, unknown>,
    severity: Severity = "info",
  ): void {
    this.logger.logEvent(eventType, severity, data);
  }

  /**
   * Check if an action is allowed by the workspace policy.
   *
   * @param action The action to check (e.g., "read_file", "network_access")
   * @param context Context for the action (e.g., {path: "/etc/passwd"})
   * @returns True if allowed, False if denied
   */
  async checkPolicy(action: string, context: Record<string, unknown>): Promise<boolean> {
    if (!this.config.workspaceId) {
      return true;
    }

    if (this.policyGateway) {
      const decision = this.policyGateway.checkCapability(action);
      return decision.allowed;
    }

    const payload = {
      action,
      resource: context.resource ?? "",
      context,
      agent_id: this.config.agentId,
    };

    try {
      const response = await this.client.post("/api/v1/policies/evaluate", payload);
      if (response.status === 200) {
        return response.data?.decision !== "deny";
      }
      return true;
    } catch {
      return true;
    }
  }

  /**
   * Shutdown the SDK gracefully.
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    this.beacon.stop();
    await this.logger.shutdown();
  }

  /**
   * Get the current beacon status (heartbeat health, connection info).
   */
  getBeaconStatus(): BeaconStatus {
    return this.beacon.getStatus();
  }

  /**
   * Get runtime credentials after SDK has started.
   *
   * Use this to share credentials with TaskWorker to avoid dual bootstrap
   * token consumption. The SDK must be started first.
   *
   * @returns Runtime credentials or null if not bootstrapped
   */
  getRuntimeCredentials(): { installationId: string; runtimeToken: string } | null {
    return this.beacon.getRuntimeCredentials();
  }

  /**
   * Get full installation credentials for persistence.
   *
   * Use this after successful SDK start to extract credentials that can be
   * saved as environment variables or secrets for future container restarts.
   * These credentials allow recovery without consuming a new install token.
   *
   * Recommended workflow for ephemeral compute (Cloud Run, K8s, etc.):
   * 1. First deploy: use SEKUIRE_INSTALL_TOKEN for initial bootstrap
   * 2. After start: call getInstallationCredentials() to extract creds
   * 3. Save to secrets manager (AWS Secrets Manager, K8s Secret, etc.)
   * 4. Update deployment with:
   *    - SEKUIRE_INSTALLATION_ID
   *    - SEKUIRE_REFRESH_TOKEN
   *    - (optionally) SEKUIRE_RUNTIME_TOKEN
   * 5. Future restarts: SDK auto-recovers using refresh token
   *
   * @example
   * ```ts
   * const sdk = SekuireSDK.fromEnv();
   * await sdk.start();
   *
   * const creds = sdk.getInstallationCredentials();
   * if (creds) {
   *   console.log('Save these to your secrets manager:');
   *   console.log(`SEKUIRE_INSTALLATION_ID=${creds.installationId}`);
   *   console.log(`SEKUIRE_REFRESH_TOKEN=${creds.refreshToken}`);
   * }
   * ```
   *
   * @returns Full installation credentials or null if not bootstrapped
   */
  getInstallationCredentials(): InstallationCredentials | null {
    return this.beacon.getInstallationCredentials();
  }

  /**
   * Create a TaskWorker that shares credentials with this SDK instance.
   *
   * This avoids the dual bootstrap token consumption issue by reusing
   * the runtime credentials from the SDK's beacon. The SDK must be started
   * before calling this method.
   *
   * The Worker receives full credentials (installationId, runtimeToken, refreshToken)
   * so it can independently refresh tokens when they expire.
   *
   * @param options Optional worker configuration overrides
   * @returns TaskWorker instance ready to be started
   * @throws Error if SDK hasn't been started or bootstrap failed
   *
   * @example
   * ```ts
   * const sdk = new SekuireSDK({ ... });
   * await sdk.start();
   *
   * const worker = sdk.createTaskWorker();
   * worker.onTask("my-capability", async (ctx, input) => {
   *   return { result: "done" };
   * });
   * await worker.start();
   * ```
   */
  createTaskWorker(options?: {
    heartbeatIntervalMs?: number;
    reconnectDelayMs?: number;
    maxReconnectDelayMs?: number;
    capabilities?: string[];
  }): TaskWorker {
    const credentials = this.getInstallationCredentials();
    if (!credentials) {
      throw new Error(
        "SDK must be started before creating a TaskWorker. " +
        "Call sdk.start() first and ensure bootstrap succeeded."
      );
    }

    const workerConfig: WorkerConfig = {
      apiBaseUrl: this.config.apiUrl,
      agentId: this.config.agentId,
      runtimeToken: credentials.runtimeToken,
      installationId: credentials.installationId,
      refreshToken: credentials.refreshToken,
      credentialsStore: this.credentialsStore,
      tokenProvider: () => this.credentialsStore.getRuntimeToken(),
      deploymentUrl: detectDeploymentUrl(),
      capabilities: options?.capabilities ?? this.config.capabilities,
      heartbeatIntervalMs: options?.heartbeatIntervalMs,
      reconnectDelayMs: options?.reconnectDelayMs,
      maxReconnectDelayMs: options?.maxReconnectDelayMs,
      policyGateway: this.policyGateway ?? undefined,
    };

    return new TaskWorker(workerConfig);
  }

  /**
   * Create an A2A task delegator that reuses SDK runtime credentials when available.
   *
   * Route calls continue to use the SDK auth token (API key), while direct fallback
   * task registration/completion can use runtime token if bootstrapped.
   */
  createDelegator(options?: {
    timeout?: number;
    pollInterval?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    retryBackoffMultiplier?: number;
  }): A2ATaskDelegator {
    return new A2ATaskDelegator({
      apiUrl: this.config.apiUrl,
      authToken: this.config.apiKey || "",
      workspaceId: this.config.workspaceId,
      agentId: this.config.agentId,
      timeout: options?.timeout,
      pollInterval: options?.pollInterval,
      maxRetries: options?.maxRetries,
      retryDelayMs: options?.retryDelayMs,
      retryBackoffMultiplier: options?.retryBackoffMultiplier,
      policyGateway: this.policyGateway ?? undefined,
      tokenResolver: () => this.credentialsStore.getRuntimeToken(),
      onUnauthorized: async () => {
        await this.credentialsStore.refreshRuntimeToken("A2AClient");
      },
    });
  }

  /**
   * Get the agent ID.
   */
  get agentId(): string {
    return this.config.agentId;
  }

  /**
   * Get the agent's public key.
   */
  get publicKey(): string | undefined {
    return this.identity.publicKey;
  }

  /**
   * Sign a message with the agent's private key.
   */
  async sign(message: string): Promise<string> {
    return this.identity.sign(message);
  }

  /**
   * Verify a signature using the agent's public key.
   */
  verify(message: string, signature: string): boolean {
    return this.identity.verify(message, signature);
  }

  /**
   * Get the underlying identity object.
   */
  getIdentity(): AgentIdentity {
    return this.identity;
  }

  /**
   * Get the underlying logger object.
   */
  getLogger(): SekuireLogger {
    return this.logger;
  }

  getPolicyGateway(): PolicyGateway | null {
    return this.policyGateway;
  }
}
