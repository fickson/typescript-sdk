/**
 * Sekuire Beacon - Deployment Registration & Heartbeat
 *
 * Automatically registers the agent with Sekuire and sends periodic heartbeats
 * to show online status in the Dashboard.
 *
 * Supports two authentication modes:
 * 1. Install Token (recommended): Use an install token from the dashboard
 * 2. API Key: Use an API key for SDK-initiated bootstrap (requires workspace)
 */

import { detectDeploymentUrl } from "./platform-url";
import type { PolicyGateway } from "./policy-gateway";
import { RuntimeCredentialsStore, applyBootstrapResponse, type BootstrapTarget } from "./runtime-credentials";

// ============================================================================
// Types
// ============================================================================

export interface BeaconConfig {
  /** Sekuire Core API base URL */
  apiBaseUrl: string;
  /** Install token from dashboard (preferred for BYOC deployments) */
  installToken?: string;
  /** API key for authentication (reads from SEKUIRE_API_KEY if not set) */
  apiKey?: string;
  /** Agent ID to register */
  agentId: string;
  /** Workspace ID (required when using API key without install token) */
  workspaceId?: string;
  /** Heartbeat interval in seconds (default: 60) */
  heartbeatIntervalSeconds?: number;
  /** Optional explicit deployment URL (auto-detected if not set) */
  deploymentUrl?: string;
  /** Optional capabilities this agent provides */
  capabilities?: string[];
  /** Optional callback invoked on status changes */
  onStatusChange?: (status: BeaconStatus) => void;
  /** Optional shared credentials store for token synchronization */
  credentialsStore?: RuntimeCredentialsStore;
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
  policyGateway?: PolicyGateway;
}

export interface BeaconStatus {
  isRunning: boolean;
  installationId?: string;
  runtimeToken?: string;
  deploymentUrl?: string;
  lastHeartbeat?: Date;
  failedHeartbeats: number;
  /** True if bootstrap failed and agent is running without Sekuire features */
  degradedMode: boolean;
  /** Indicates credentials were recovered from env vars rather than fresh bootstrap */
  recoveredFromEnv?: boolean;
}

export interface InstallationCredentials {
  installationId: string;
  runtimeToken: string;
  refreshToken: string;
  expiresAt?: string;
}

export interface BootstrapResponse {
  installation_id: string;
  runtime_token: string;
  refresh_token?: string;
  expires_at: string;
  heartbeat_interval: number;
}

// ============================================================================
// Beacon Class
// ============================================================================

export class Beacon {
  private config: BeaconConfig & { heartbeatIntervalSeconds: number };
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private installationId: string | null = null;
  private runtimeToken: string | null = null;
  private refreshToken: string | null = null;
  private lastHeartbeat: Date | null = null;
  private failedHeartbeats: number = 0;
  private degradedMode: boolean = false;
  private recoveredFromEnv: boolean = false;
  private expiresAt: string | null = null;
  private credentialsStore?: RuntimeCredentialsStore;
  private policyGateway?: PolicyGateway;

  constructor(config: BeaconConfig) {
    const storeSnapshot = config.credentialsStore?.getAll() || {};
    const resolvedApiKey = config.apiKey || this.getEnvVar('SEKUIRE_API_KEY') || '';
    const resolvedInstallToken = config.installToken || this.getEnvVar('SEKUIRE_INSTALL_TOKEN');
    const resolvedInstallationId =
      config.installationId || storeSnapshot.installationId || this.getEnvVar('SEKUIRE_INSTALLATION_ID');
    const resolvedRefreshToken =
      config.refreshToken || storeSnapshot.refreshToken || this.getEnvVar('SEKUIRE_REFRESH_TOKEN');
    const resolvedRuntimeToken =
      config.runtimeToken || storeSnapshot.runtimeToken || this.getEnvVar('SEKUIRE_RUNTIME_TOKEN');

    this.config = {
      ...config,
      heartbeatIntervalSeconds: config.heartbeatIntervalSeconds ?? 60,
      apiKey: resolvedApiKey,
      installToken: resolvedInstallToken,
      installationId: resolvedInstallationId,
      refreshToken: resolvedRefreshToken,
      runtimeToken: resolvedRuntimeToken,
      capabilities: config.capabilities ?? [],
    };
    this.credentialsStore = config.credentialsStore;
    this.policyGateway = config.policyGateway;
    if (this.credentialsStore) {
      this.credentialsStore.setApiBaseUrl(this.config.apiBaseUrl);
      this.credentialsStore.update({
        installationId: resolvedInstallationId,
        refreshToken: resolvedRefreshToken,
        runtimeToken: resolvedRuntimeToken,
      });
    }

    const hasRecoveryCredentials = resolvedInstallationId && resolvedRefreshToken;
    if (!this.config.installToken && !this.config.apiKey && !hasRecoveryCredentials) {
      console.warn('[Beacon] No credentials provided. Set one of:');
      console.warn('[Beacon]   - SEKUIRE_INSTALL_TOKEN (for initial bootstrap)');
      console.warn('[Beacon]   - SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN (for recovery)');
    }
  }

  /**
   * Start the beacon - registers with Sekuire and begins heartbeat loop
   *
   * Authentication priority:
   * 1. If SEKUIRE_INSTALLATION_ID + SEKUIRE_REFRESH_TOKEN are set, recover credentials
   * 2. If SEKUIRE_RUNTIME_TOKEN is also set and valid, use it directly
   * 3. Fall back to SEKUIRE_INSTALL_TOKEN for fresh bootstrap
   *
   * If all authentication methods fail, the agent continues running in degraded mode
   * without Sekuire features. This prevents auth failures from crashing agents.
   */
  async start(): Promise<void> {
    if (this.intervalId) {
      console.warn('[Beacon] Already running');
      return;
    }

    const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();

    console.log(`[Beacon] Starting for agent ${this.config.agentId}`);
    if (deploymentUrl) {
      console.log(`[Beacon] Deployment URL: ${deploymentUrl}`);
    }

    let authenticated = false;

    // Priority 1: Try credential recovery from env vars
    if (this.config.installationId && this.config.refreshToken) {
      console.log('[Beacon] Found recovery credentials in environment');
      authenticated = await this.tryCredentialRecovery();
      if (authenticated) {
        this.recoveredFromEnv = true;
        console.log('[Beacon] Successfully recovered credentials from environment');
      }
    }

    // Priority 2: Fall back to fresh bootstrap with install token
    if (!authenticated) {
      authenticated = await this.bootstrapWithRetry(deploymentUrl);
    }

    if (!authenticated) {
      this.degradedMode = true;
      console.warn('[Beacon] Running in degraded mode - Sekuire features disabled');
      console.warn('[Beacon] To re-enable: generate a new install token from the dashboard');
      this.notifyStatusChange();
      return;
    }

    console.log(`[Beacon] Bootstrap successful, installation ID: ${this.installationId}`);
    if (this.recoveredFromEnv) {
      console.log('[Beacon] Credentials recovered via refresh token (no install token consumed)');
    }

    // Start heartbeat loop
    const intervalMs = this.config.heartbeatIntervalSeconds * 1000;
    this.intervalId = setInterval(() => {
      this.heartbeat().catch((err) => {
        console.error('[Beacon] Heartbeat failed:', err);
      });
    }, intervalMs);

    // Send first heartbeat immediately
    await this.heartbeat().catch(() => {});
    this.notifyStatusChange();
  }

  /**
   * Stop the beacon
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[Beacon] Stopped');
    }
  }

  setPolicyGateway(gateway: PolicyGateway): void {
    this.policyGateway = gateway;
  }

  /**
   * Get current beacon status
   */
  getStatus(): BeaconStatus {
    return {
      isRunning: this.intervalId !== null || this.degradedMode,
      installationId: this.getInstallationId() || undefined,
      runtimeToken: this.getRuntimeToken() ? '***' + this.getRuntimeToken()!.slice(-4) : undefined,
      deploymentUrl: this.config.deploymentUrl || detectDeploymentUrl(),
      lastHeartbeat: this.lastHeartbeat || undefined,
      failedHeartbeats: this.failedHeartbeats,
      degradedMode: this.degradedMode,
      recoveredFromEnv: this.recoveredFromEnv,
    };
  }

  /**
   * Get runtime credentials after successful bootstrap.
   *
   * Use this to share credentials with other components (e.g., TaskWorker)
   * to avoid dual bootstrap token consumption.
   *
   * @returns Runtime credentials or null if not bootstrapped
   */
  getRuntimeCredentials(): { installationId: string; runtimeToken: string } | null {
    const installationId = this.getInstallationId();
    const runtimeToken = this.getRuntimeToken();
    if (!installationId || !runtimeToken) {
      return null;
    }
    return {
      installationId,
      runtimeToken,
    };
  }

  /**
   * Get full installation credentials for persistence.
   *
   * Use this after successful bootstrap to extract credentials that can be
   * saved as environment variables or secrets for future container restarts.
   * These credentials allow recovery without consuming a new install token.
   *
   * Example usage:
   * ```ts
   * const creds = beacon.getInstallationCredentials();
   * if (creds) {
   *   // Save to your secrets manager (AWS Secrets Manager, K8s Secret, etc.)
   *   // SEKUIRE_INSTALLATION_ID = creds.installationId
   *   // SEKUIRE_REFRESH_TOKEN = creds.refreshToken
   *   // SEKUIRE_RUNTIME_TOKEN = creds.runtimeToken (optional, has expiry)
   * }
   * ```
   *
   * @returns Full installation credentials or null if not bootstrapped
   */
  getInstallationCredentials(): InstallationCredentials | null {
    const installationId = this.getInstallationId();
    const runtimeToken = this.getRuntimeToken();
    const refreshToken = this.getRefreshToken();
    if (!installationId || !runtimeToken || !refreshToken) {
      return null;
    }
    return {
      installationId,
      runtimeToken,
      refreshToken,
      expiresAt: this.expiresAt || undefined,
    };
  }

  /**
   * Try to recover credentials using installation ID and refresh token from env.
   *
   * This allows agents to survive container restarts without needing a new
   * install token, which is especially important for ephemeral compute
   * environments like Cloud Run, Kubernetes, or serverless functions.
   *
   * @returns true if recovery succeeded, false otherwise
   */
  private async tryCredentialRecovery(): Promise<boolean> {
    const installationId = this.getInstallationId() || this.config.installationId;
    const refreshToken = this.getRefreshToken() || this.config.refreshToken;
    const existingRuntimeToken = this.getRuntimeToken() || this.config.runtimeToken;

    if (!installationId || !refreshToken) {
      return false;
    }

    // If we have an existing runtime token, try to use it first
    if (existingRuntimeToken) {
      console.log('[Beacon] Found existing runtime token, validating...');
      const isValid = await this.validateRuntimeToken(installationId, existingRuntimeToken);
      if (isValid) {
        this.installationId = installationId;
        this.runtimeToken = existingRuntimeToken;
        this.refreshToken = refreshToken;
        this.credentialsStore?.update({
          installationId,
          runtimeToken: existingRuntimeToken,
          refreshToken,
        });
        console.log('[Beacon] Existing runtime token is valid');
        return true;
      }
      console.log('[Beacon] Existing runtime token is invalid or expired, refreshing...');
    }

    // Refresh to get a new runtime token
    try {
      if (this.credentialsStore) {
        this.credentialsStore.update({ installationId, refreshToken });
        await this.credentialsStore.refreshRuntimeToken("Beacon");
        this.installationId = installationId;
        this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
        this.refreshToken = refreshToken;
        this.expiresAt = this.credentialsStore.getExpiresAt() ?? null;
        console.log('[Beacon] Credentials recovered via refresh token');
        return true;
      }

      const response = await fetch(
        `${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refresh_token: refreshToken,
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        console.error(`[Beacon] Credential recovery failed: ${response.status} - ${body}`);
        return false;
      }

      const data = await response.json();
      this.installationId = installationId;
      this.runtimeToken = data.runtime_token;
      this.refreshToken = refreshToken;
      this.expiresAt = data.expires_at || null;

      console.log('[Beacon] Credentials recovered via refresh token');
      return true;
    } catch (error) {
      console.error('[Beacon] Credential recovery error:', error);
      return false;
    }
  }

  /**
   * Validate a runtime token by making a lightweight API call.
   */
  private async validateRuntimeToken(installationId: string, token: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/api/v1/installations/${installationId}/lease`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            status: 'running',
          }),
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Bootstrap with retry and exponential backoff
   *
   * Returns true if bootstrap succeeded, false if all retries exhausted.
   * Does NOT throw - allows agent to continue in degraded mode.
   */
  private async bootstrapWithRetry(
    deploymentUrl?: string,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<boolean> {
    let delay = initialDelayMs;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.bootstrap(deploymentUrl);
        return true;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        const errorMsg = error instanceof Error ? error.message : String(error);

        // Check if error is permanent (expired/invalid token) vs transient (network)
        const isPermanentError =
          errorMsg.includes('401') ||
          errorMsg.includes('expired') ||
          errorMsg.includes('invalid') ||
          errorMsg.includes('not found');

        if (isPermanentError) {
          console.error(`[Beacon] Bootstrap failed (permanent error): ${errorMsg}`);
          // Try recovery bootstrap if we have API key
          if (this.config.apiKey && this.config.workspaceId) {
            console.log('[Beacon] Attempting recovery bootstrap with API key...');
            const recovered = await this.tryRecoveryBootstrap(deploymentUrl);
            if (recovered) {
              return true;
            }
          }
          console.error('[Beacon] Install token expired or invalid - generate a new one from the dashboard');
          return false;
        }

        if (isLastAttempt) {
          console.error(`[Beacon] Bootstrap failed after ${maxRetries} attempts: ${errorMsg}`);
          return false;
        }

        console.warn(`[Beacon] Bootstrap attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
        console.warn(`[Beacon] Retrying in ${delay}ms...`);
        await this.sleep(delay);
        delay *= 2; // Exponential backoff
      }
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Attempt recovery bootstrap using API key when install token fails
   *
   * Recovery bootstrap allows re-issuing runtime credentials without
   * needing a new install token from the dashboard.
   */
  private async tryRecoveryBootstrap(deploymentUrl?: string): Promise<boolean> {
    if (!this.config.apiKey || !this.config.workspaceId) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.config.apiKey,
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          workspace_id: this.config.workspaceId,
          upstream_url: deploymentUrl,
          capabilities: this.config.capabilities ?? [],
          heartbeat_interval_seconds: this.config.heartbeatIntervalSeconds,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error(`[Beacon] Recovery bootstrap failed: ${response.status} - ${body}`);
        return false;
      }

      const data: BootstrapResponse = await response.json();
      applyBootstrapResponse(this as unknown as BootstrapTarget, data);
      console.log(`[Beacon] Recovery bootstrap successful, installation ID: ${this.installationId}`);
      return true;
    } catch (error) {
      console.error('[Beacon] Recovery bootstrap error:', error);
      return false;
    }
  }

  /**
   * Bootstrap registration with Sekuire
   *
   * Exchanges an install token for runtime credentials (installation_id + runtime_token).
   * The install token is obtained from the dashboard or CLI.
   */
  private async bootstrap(deploymentUrl?: string): Promise<void> {
    if (!this.config.installToken) {
      throw new Error(
        'Install token required for beacon registration. ' +
        'Generate one from the dashboard or use: sekuire install token --workspace <id>'
      );
    }

    const response = await fetch(`${this.config.apiBaseUrl}/api/v1/installations/bootstrap`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        install_token: this.config.installToken,
        upstream_url: deploymentUrl,
        capabilities: this.config.capabilities ?? [],
        heartbeat_interval_seconds: this.config.heartbeatIntervalSeconds,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Bootstrap failed: ${response.status} ${response.statusText} - ${body}`);
    }

    const data: BootstrapResponse = await response.json();
    applyBootstrapResponse(this as unknown as BootstrapTarget, data);
    this.expiresAt = data.expires_at || null;
  }

  /**
   * Send heartbeat (lease renewal) to Sekuire
   *
   * Uses the installation-based lease endpoint with runtime token authentication.
   */
  private async heartbeat(): Promise<void> {
    const installationId = this.getInstallationId();
    const runtimeToken = this.getRuntimeToken();
    if (!installationId || !runtimeToken) {
      console.warn('[Beacon] Cannot send heartbeat - not bootstrapped');
      return;
    }

    const deploymentUrl = this.config.deploymentUrl || detectDeploymentUrl();
    const prevFailed = this.failedHeartbeats;

    try {
      const response = await fetch(
        `${this.config.apiBaseUrl}/api/v1/installations/${installationId}/lease`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${runtimeToken}`,
          },
          body: JSON.stringify({
            status: 'running',
            heartbeat_interval_seconds: this.config.heartbeatIntervalSeconds,
            upstream_url: deploymentUrl,
          }),
        }
      );

      if (response.status === 401) {
        // Token expired - try to refresh using refresh token
        console.warn('[Beacon] Runtime token expired, attempting refresh...');
        await this.refreshRuntimeToken();
        // Retry heartbeat after refresh
        return this.heartbeat();
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Heartbeat failed: ${response.status} - ${body}`);
      }

      // Check if server auto-refreshed our token (sliding expiration)
      const data = await response.json();
      if (data.refreshed_token) {
        this.runtimeToken = data.refreshed_token.runtime_token;
        this.credentialsStore?.setRuntimeToken(
          data.refreshed_token.runtime_token,
          data.refreshed_token.expires_at
        );
        console.log(`[Beacon] Token auto-refreshed by server (version ${data.refreshed_token.token_version})`);
      }

      if (this.policyGateway && "active_policy_hash" in data) {
        this.policyGateway.onHeartbeatResponse(data.active_policy_hash ?? null).catch((err) => {
          console.warn("[Beacon] Policy sync failed:", err);
        });
      }

      this.lastHeartbeat = new Date();
      this.failedHeartbeats = 0;

      if (prevFailed > 0) {
        this.notifyStatusChange();
      }
    } catch (error) {
      this.failedHeartbeats++;
      this.notifyStatusChange();
      throw error;
    }
  }

  /**
   * Refresh the runtime token using the refresh token
   */
  private async refreshRuntimeToken(): Promise<void> {
    if (this.credentialsStore) {
      await this.credentialsStore.refreshRuntimeToken("Beacon");
      this.runtimeToken = this.credentialsStore.getRuntimeToken() ?? null;
      return;
    }

    const installationId = this.getInstallationId();
    const refreshToken = this.getRefreshToken();
    if (!installationId || !refreshToken) {
      throw new Error('Cannot refresh token - missing installation ID or refresh token');
    }

    const response = await fetch(
      `${this.config.apiBaseUrl}/api/v1/installations/${installationId}/refresh`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
    console.log('[Beacon] Runtime token refreshed successfully');
  }

  /**
   * Notify status change callback
   */
  private notifyStatusChange(): void {
    if (this.config.onStatusChange) {
      this.config.onStatusChange(this.getStatus());
    }
  }

  /**
   * Get environment variable value (works in Node.js and browser)
   */
  private getEnvVar(name: string): string | undefined {
    if (typeof process !== 'undefined' && process.env) {
      return process.env[name];
    }
    return undefined;
  }

  private getInstallationId(): string | null {
    const storeValue = this.credentialsStore?.getInstallationId();
    if (storeValue) {
      this.installationId = storeValue;
      return storeValue;
    }
    return this.installationId;
  }

  private getRuntimeToken(): string | null {
    const storeValue = this.credentialsStore?.getRuntimeToken();
    if (storeValue) {
      this.runtimeToken = storeValue;
      return storeValue;
    }
    return this.runtimeToken;
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

/**
 * Create a new beacon instance
 */
export function createBeacon(config: BeaconConfig): Beacon {
  return new Beacon(config);
}
