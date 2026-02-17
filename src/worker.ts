/**
 * Sekuire Task Worker
 *
 * Handles SSE connection to Core for real-time task delivery.
 * Provides `onTask()` API for agents to register task handlers.
 */

import EventSource from "eventsource";
import { detectDeploymentUrl } from "./platform-url";
import type { PolicyGateway } from "./policy-gateway";
import { RuntimeCredentialsStore, applyBootstrapResponse, type BootstrapTarget } from "./runtime-credentials";

// ============================================================================
// Types
// ============================================================================

export interface TaskEvent {
  id: string;
  target_capability?: string;
  target_tool?: string;
  input: Record<string, unknown>;
  workspace_id: string;
  requester_agent_id?: string;
  parent_task_id?: string;
  trace_id?: string;
  workflow_id?: string;
}

export interface TaskContext {
  taskId: string;
  workspaceId: string;
  requesterId?: string;
  parentTaskId?: string;
  traceId?: string;
  workflowId?: string;
}

export type TaskHandler = (
  ctx: TaskContext,
  input: Record<string, unknown>
) => Promise<unknown>;

export interface WorkerConfig {
  apiBaseUrl: string;
  agentId: string;
  installToken?: string;
  runtimeToken?: string;
  /** Optional token provider for shared runtime credentials */
  tokenProvider?: () => string | undefined;
  heartbeatIntervalMs?: number;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  deploymentUrl?: string;
  capabilities?: string[];
  /** Optional shared credentials store for token synchronization */
  credentialsStore?: RuntimeCredentialsStore;
  /** Optional policy gateway for infrastructure enforcement */
  policyGateway?: PolicyGateway;
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
}

// ============================================================================
// Task Worker
// ============================================================================

export class TaskWorker {
  private eventSource: EventSource | null = null;
  private handlers: Map<string, TaskHandler> = new Map();
  private config: WorkerConfig & {
    installationId?: string;
    refreshToken?: string;
  };
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectDelay: number;
  private isConnected: boolean = false;
  private isPaused: boolean = false;
  private installationId: string | null = null;
  private runtimeToken: string | null = null;
  private refreshToken: string | null = null;
  private expiresAt: number | null = null;
  private onCommandCallback?: (cmd: { type: string; reason?: string }) => void;
  private recoveredFromEnv: boolean = false;
  private credentialsStore?: RuntimeCredentialsStore;
  private tokenProvider?: () => string | undefined;
  private policyGateway?: PolicyGateway;
  private degradedMode: boolean = false;

  constructor(config: WorkerConfig) {
    const storeSnapshot = config.credentialsStore?.getAll() || {};
    const resolvedInstallationId =
      config.installationId || storeSnapshot.installationId || this.getEnvVar('SEKUIRE_INSTALLATION_ID');
    const resolvedRefreshToken =
      config.refreshToken || storeSnapshot.refreshToken || this.getEnvVar('SEKUIRE_REFRESH_TOKEN');
    const resolvedRuntimeToken =
      config.runtimeToken || storeSnapshot.runtimeToken || this.getEnvVar('SEKUIRE_RUNTIME_TOKEN');
    const resolvedInstallToken = config.installToken || this.getEnvVar('SEKUIRE_INSTALL_TOKEN');

    const hasRecoveryCredentials = resolvedInstallationId && resolvedRefreshToken;

    if (!resolvedInstallToken && !resolvedRuntimeToken && !hasRecoveryCredentials) {
      console.warn(
        "[Worker] No credentials provided (installToken, runtimeToken, or installationId + refreshToken). " +
        "Worker will not connect until credentials are provided."
      );
      this.degradedMode = true;
    }

    this.config = {
      heartbeatIntervalMs: 10000, // 10 seconds
      reconnectDelayMs: 1000,     // 1 second initial
      maxReconnectDelayMs: 30000, // 30 seconds max
      capabilities: [],
      ...config,
      installToken: resolvedInstallToken,
      runtimeToken: resolvedRuntimeToken,
      installationId: resolvedInstallationId,
      refreshToken: resolvedRefreshToken,
    };
    this.credentialsStore = config.credentialsStore;
    this.tokenProvider = config.tokenProvider;
    this.policyGateway = config.policyGateway;
    this.reconnectDelay = this.config.reconnectDelayMs!;
    this.runtimeToken = resolvedRuntimeToken || null;
    this.installationId = resolvedInstallationId || null;
    this.refreshToken = resolvedRefreshToken || null;
    if (this.credentialsStore) {
      this.credentialsStore.setApiBaseUrl(this.config.apiBaseUrl);
      this.credentialsStore.update({
        installationId: resolvedInstallationId,
        refreshToken: resolvedRefreshToken,
        runtimeToken: resolvedRuntimeToken,
      });
    }
  }

  private getEnvVar(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  }

  /**
   * Register a handler for a specific capability
   */
  onTask(capability: string, handler: TaskHandler): this {
    this.handlers.set(capability, handler);
    console.log(`[Worker] Registered handler for capability: ${capability}`);
    return this;
  }

  /**
   * Start the worker (connects to SSE stream and starts heartbeat)
   *
   * Authentication priority:
   * 1. If runtimeToken is provided, use it directly
   * 2. If installationId + refreshToken are set, recover credentials
   * 3. Fall back to installToken for fresh bootstrap
   */
  async start(): Promise<void> {
    if (this.degradedMode) {
      console.warn("[Worker] Cannot start in degraded mode - no credentials available.");
      return;
    }

    console.log("[Worker] Starting task worker...");

    let authenticated = false;

    // Priority 1: Already have runtime token
    const tokenFromProvider = this.tokenProvider?.();
    const tokenFromStore = this.credentialsStore?.getRuntimeToken();
    if (tokenFromProvider || tokenFromStore || this.runtimeToken) {
      if (tokenFromProvider) {
        this.runtimeToken = tokenFromProvider;
      } else if (tokenFromStore) {
        this.runtimeToken = tokenFromStore;
      }
      console.log("[Worker] Using provided runtime token");
      authenticated = true;
    }

    // Priority 2: Try credential recovery from env vars
    if (!authenticated && this.config.installationId && this.config.refreshToken) {
      console.log("[Worker] Attempting credential recovery from environment...");
      authenticated = await this.tryCredentialRecovery();
      if (authenticated) {
        this.recoveredFromEnv = true;
        console.log("[Worker] Successfully recovered credentials from environment");
      }
    }

    // Priority 3: Fall back to fresh bootstrap
    if (!authenticated) {
      await this.bootstrap();
      authenticated = true;
    }

    this.connect();
    this.startHeartbeat();
  }

  /**
   * Try to recover credentials using installation ID and refresh token.
   */
  private async tryCredentialRecovery(): Promise<boolean> {
    const installationId = this.getInstallationId() || this.config.installationId;
    const refreshToken = this.getRefreshToken() || this.config.refreshToken;

    if (!installationId || !refreshToken) {
      return false;
    }

    try {
      if (this.credentialsStore) {
        this.credentialsStore.update({ installationId, refreshToken });
        await this.credentialsStore.refreshRuntimeToken("Worker");
        this.installationId = installationId;
        this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
        this.refreshToken = refreshToken;
        const expiresAt = this.credentialsStore.getExpiresAt();
        this.expiresAt = expiresAt ? new Date(expiresAt).getTime() : null;
        console.log(`[Worker] Credentials recovered for installation: ${installationId}`);
        return true;
      }

      const response = await fetch(
        `${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            refresh_token: refreshToken,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        console.error(`[Worker] Credential recovery failed: ${response.status} - ${body}`);
        return false;
      }

      const data = await response.json();
      this.installationId = installationId;
      this.runtimeToken = data.runtime_token;
      this.refreshToken = refreshToken;
      this.expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;

      console.log(`[Worker] Credentials recovered for installation: ${installationId}`);
      return true;
    } catch (error) {
      console.error("[Worker] Credential recovery error:", error);
      return false;
    }
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    console.log("[Worker] Stopping task worker...");
    
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    this.isConnected = false;
  }

  /**
   * Check if the worker is currently paused
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Register a callback for control commands
   */
  onCommand(callback: (cmd: { type: string; reason?: string }) => void): this {
    this.onCommandCallback = callback;
    return this;
  }

  /**
   * Handle control commands from SSE or heartbeat fallback
   */
  private handleCommand(cmd: { type: string; reason?: string }): void {
    console.log(`[Worker] Received command: ${cmd.type}`);
    
    switch (cmd.type) {
      case 'pause':
        this.isPaused = true;
        console.log('[Worker] Paused by administrator:', cmd.reason || 'No reason provided');
        break;
      case 'resume':
        this.isPaused = false;
        console.log('[Worker] Resumed by administrator');
        break;
      case 'terminate':
        console.log('[Worker] Terminating by administrator command...');
        this.stop().then(() => {
          if (typeof process !== 'undefined') {
            process.exit(0);
          }
        });
        break;
      default:
        console.warn(`[Worker] Unknown command: ${cmd.type}`);
    }
    
    // Call user-defined callback if registered
    if (this.onCommandCallback) {
      this.onCommandCallback(cmd);
    }
  }

  /**
   * Get runtime token for API calls
   */
  private getToken(): string {
    const tokenFromProvider = this.tokenProvider?.();
    if (tokenFromProvider) {
      this.runtimeToken = tokenFromProvider;
      return tokenFromProvider;
    }
    const tokenFromStore = this.credentialsStore?.getRuntimeToken();
    if (tokenFromStore) {
      this.runtimeToken = tokenFromStore;
      return tokenFromStore;
    }
    if (!this.runtimeToken) {
      throw new Error("No runtime token available - call bootstrap first");
    }
    return this.runtimeToken;
  }

  /**
   * Connect to SSE stream
   */
  private connect(): void {
    const url = `${this.config.apiBaseUrl}/api/v1/tasks/stream`;

    console.log(`[Worker] Connecting to SSE stream: ${url}`);

    this.eventSource = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${this.getToken()}`,
      },
    } as any);

    this.eventSource.onopen = () => {
      console.log("[Worker] SSE connection established");
      this.isConnected = true;
      this.reconnectDelay = this.config.reconnectDelayMs!; // Reset backoff
    };

    this.eventSource.addEventListener("connected", (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      console.log(`[Worker] Connected as agent: ${data.agent_id}`);
      console.log(`[Worker] Capabilities: ${data.capabilities?.join(", ") || "none"}`);
    });

    this.eventSource.addEventListener("new_task", async (event: MessageEvent) => {
      const task: TaskEvent = JSON.parse(event.data);
      await this.handleTask(task);
    });

    // Kill Switch: Listen for control commands
    this.eventSource.addEventListener("command", (event: MessageEvent) => {
      const cmd = JSON.parse(event.data);
      this.handleCommand(cmd);
    });

    this.eventSource.onerror = (error: Event) => {
      console.error("[Worker] SSE connection error:", error);
      this.isConnected = false;
      this.scheduleReconnect();
    };
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    console.log(`[Worker] Reconnecting in ${this.reconnectDelay}ms...`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.connect();
      }
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.config.maxReconnectDelayMs!
    );
  }

  /**
   * Handle incoming task
   */
  private async handleTask(task: TaskEvent): Promise<void> {
    // Kill Switch: Block task execution if paused
    if (this.isPaused) {
      console.log(`[Worker] Task ${task.id} rejected - agent is paused`);
      await this.completeTask(task.id, "failed", null, { message: "Agent has been paused by administrator." });
      return;
    }

    console.log(`[Worker] Received task: ${task.id}`);

    // Find handler by capability or tool
    const capability = task.target_capability || task.target_tool || "default";

    if (this.policyGateway) {
      const rateLimitDecision = this.policyGateway.checkRateLimit("request");
      if (!rateLimitDecision.allowed) {
        const reason = rateLimitDecision.violations[0]?.message || "Rate limit exceeded";
        console.warn(`[Worker] Task ${task.id} rate limited: ${reason}`);
        await this.completeTask(task.id, "failed", null, { message: reason, code: "RATE_LIMIT_EXCEEDED" });
        return;
      }

      const decision = this.policyGateway.checkCapability(capability);
      if (!decision.allowed) {
        const reason = decision.violations[0]?.message || "Denied by policy";
        console.warn(`[Worker] Task ${task.id} denied by policy: ${reason}`);
        await this.completeTask(task.id, "failed", null, { message: reason, code: "POLICY_DENIED" });
        return;
      }
    }

    const handler = this.handlers.get(capability) || this.handlers.get("default");

    if (!handler) {
      console.warn(`[Worker] No handler for capability: ${capability}`);
      await this.completeTask(task.id, "failed", null, {
        error: `No handler registered for capability: ${capability}`,
      });
      return;
    }

    const ctx: TaskContext = {
      taskId: task.id,
      workspaceId: task.workspace_id,
      requesterId: task.requester_agent_id,
      parentTaskId: task.parent_task_id,
      traceId: task.trace_id,
      workflowId: task.workflow_id,
    };

    try {
      console.log(`[Worker] Executing handler for: ${capability}`);
      const result = await handler(ctx, task.input);
      await this.completeTask(task.id, "completed", result, null);
      console.log(`[Worker] Task ${task.id} completed successfully`);
    } catch (error) {
      console.error(`[Worker] Task ${task.id} failed:`, error);
      await this.completeTask(task.id, "failed", null, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Report task completion to Core
   */
  private async completeTask(
    taskId: string,
    status: "completed" | "failed",
    output: unknown,
    error: unknown
  ): Promise<void> {
    try {
      await fetch(`${this.config.apiBaseUrl}/api/v1/tasks/${taskId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify({ status, output, error }),
      });
    } catch (e) {
      console.error(`[Worker] Failed to report task completion:`, e);
    }
  }

  /**
   * Register this agent installation with Sekuire using install_token
   * Returns runtime_token for subsequent API calls
   */
  private async bootstrap(): Promise<void> {
    // If we already have a runtime token, skip bootstrap
    if (this.runtimeToken) {
      console.log("[Worker] Using provided runtime token, skipping bootstrap");
      return;
    }

    if (!this.config.installToken) {
      throw new Error("No install token provided for bootstrap");
    }

    const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          install_token: this.config.installToken,
          upstream_url: deploymentUrl,
          capabilities: this.config.capabilities || [],
          heartbeat_interval_seconds: Math.floor((this.config.heartbeatIntervalMs || 10000) / 1000),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Bootstrap failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      applyBootstrapResponse(this as unknown as BootstrapTarget, data);
      this.expiresAt = data.expires_at
        ? new Date(data.expires_at).getTime()
        : null;

      console.log(`[Worker] Bootstrapped installation: ${this.installationId}`);
    } catch (e) {
      console.error("[Worker] Bootstrap registration failed:", e);
      throw e;
    }
  }

  /**
   * Start heartbeat/lease renewal loop
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      const installationId = this.getInstallationId();
      if (!installationId) {
        return;
      }

      try {
        const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();
        const response = await fetch(
          `${this.config.apiBaseUrl}/api/v1/installations/${installationId}/lease`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.getToken()}`,
            },
            body: JSON.stringify({
              status: this.isPaused ? "stopped" : "running",
              upstream_url: deploymentUrl,
              heartbeat_interval_seconds: Math.floor((this.config.heartbeatIntervalMs || 10000) / 1000),
            }),
          }
        );

        if (response.status === 401) {
          console.warn("[Worker] Runtime token expired, attempting refresh...");
          try {
            await this.refreshRuntimeToken();
            return; // Will retry on next interval
          } catch {
            console.error("[Worker] Token refresh failed, stopping worker");
            await this.stop();
            return;
          }
        }

        if (response.ok) {
          const data = await response.json();

          // Handle server-side token auto-refresh (sliding expiration)
          if (data.refreshed_token) {
            this.runtimeToken = data.refreshed_token.runtime_token;
            if (data.refreshed_token.expires_at) {
              this.expiresAt = new Date(data.refreshed_token.expires_at).getTime();
            }
            this.credentialsStore?.setRuntimeToken(
              data.refreshed_token.runtime_token,
              data.refreshed_token.expires_at
            );
            console.log(`[Worker] Token auto-refreshed by server (version ${data.refreshed_token.token_version})`);
          }

          if (data.command) {
            this.handleCommand(data.command);
          }

          if (this.policyGateway && "active_policy_hash" in data) {
            this.policyGateway.onHeartbeatResponse(data.active_policy_hash ?? null).catch((err) => {
              console.warn("[Worker] Policy sync failed:", err);
            });
          }
        }
      } catch (e) {
        console.warn("[Worker] Heartbeat/lease failed:", e);
      }
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Refresh the runtime token using the refresh token
   */
  private async refreshRuntimeToken(): Promise<void> {
    if (this.credentialsStore) {
      await this.credentialsStore.refreshRuntimeToken("Worker");
      this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
      return;
    }

    const installationId = this.getInstallationId();
    const refreshToken = this.getRefreshToken();
    if (!installationId || !refreshToken) {
      throw new Error("Cannot refresh token - missing installation ID or refresh token");
    }

    const response = await fetch(
      `${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token refresh failed: ${response.status} - ${body}`);
    }

    const data = await response.json();
    this.runtimeToken = data.runtime_token;
    console.log("[Worker] Runtime token refreshed successfully");
  }

  private getInstallationId(): string | null {
    const storeValue = this.credentialsStore?.getInstallationId();
    if (storeValue) {
      this.installationId = storeValue;
      return storeValue;
    }
    return this.installationId;
  }

  private getRefreshToken(): string | null {
    const storeValue = this.credentialsStore?.getRefreshToken();
    if (storeValue) {
      this.refreshToken = storeValue;
      return storeValue;
    }
    return this.refreshToken;
  }
}

// ============================================================================
// Convenience Export
// ============================================================================

export function createWorker(config: WorkerConfig): TaskWorker {
  return new TaskWorker(config);
}
