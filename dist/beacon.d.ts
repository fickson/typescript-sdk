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
import type { PolicyGateway } from "./policy-gateway";
import { RuntimeCredentialsStore } from "./runtime-credentials";
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
export declare class Beacon {
    private config;
    private intervalId;
    private installationId;
    private runtimeToken;
    private refreshToken;
    private lastHeartbeat;
    private failedHeartbeats;
    private degradedMode;
    private recoveredFromEnv;
    private expiresAt;
    private credentialsStore?;
    private policyGateway?;
    constructor(config: BeaconConfig);
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
    start(): Promise<void>;
    /**
     * Stop the beacon
     */
    stop(): void;
    setPolicyGateway(gateway: PolicyGateway): void;
    /**
     * Get current beacon status
     */
    getStatus(): BeaconStatus;
    /**
     * Get runtime credentials after successful bootstrap.
     *
     * Use this to share credentials with other components (e.g., TaskWorker)
     * to avoid dual bootstrap token consumption.
     *
     * @returns Runtime credentials or null if not bootstrapped
     */
    getRuntimeCredentials(): {
        installationId: string;
        runtimeToken: string;
    } | null;
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
    getInstallationCredentials(): InstallationCredentials | null;
    /**
     * Try to recover credentials using installation ID and refresh token from env.
     *
     * This allows agents to survive container restarts without needing a new
     * install token, which is especially important for ephemeral compute
     * environments like Cloud Run, Kubernetes, or serverless functions.
     *
     * @returns true if recovery succeeded, false otherwise
     */
    private tryCredentialRecovery;
    /**
     * Validate a runtime token by making a lightweight API call.
     */
    private validateRuntimeToken;
    /**
     * Bootstrap with retry and exponential backoff
     *
     * Returns true if bootstrap succeeded, false if all retries exhausted.
     * Does NOT throw - allows agent to continue in degraded mode.
     */
    private bootstrapWithRetry;
    private sleep;
    /**
     * Attempt recovery bootstrap using API key when install token fails
     *
     * Recovery bootstrap allows re-issuing runtime credentials without
     * needing a new install token from the dashboard.
     */
    private tryRecoveryBootstrap;
    /**
     * Bootstrap registration with Sekuire
     *
     * Exchanges an install token for runtime credentials (installation_id + runtime_token).
     * The install token is obtained from the dashboard or CLI.
     */
    private bootstrap;
    /**
     * Send heartbeat (lease renewal) to Sekuire
     *
     * Uses the installation-based lease endpoint with runtime token authentication.
     */
    private heartbeat;
    /**
     * Refresh the runtime token using the refresh token
     */
    private refreshRuntimeToken;
    /**
     * Notify status change callback
     */
    private notifyStatusChange;
    /**
     * Get environment variable value (works in Node.js and browser)
     */
    private getEnvVar;
    private getInstallationId;
    private getRuntimeToken;
    private getRefreshToken;
}
/**
 * Create a new beacon instance
 */
export declare function createBeacon(config: BeaconConfig): Beacon;
