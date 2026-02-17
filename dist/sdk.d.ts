/**
 * SekuireSDK - Main SDK entry point for TypeScript agents
 *
 * Combines identity, logging, and heartbeat functionality with a simple API.
 */
import { A2ATaskDelegator } from "./a2a-delegator";
import { type BeaconStatus, type InstallationCredentials } from "./beacon";
import { AgentIdentity } from "./identity";
import { SekuireLogger, type EventType, type Severity } from "./logger";
import { PolicyGateway } from "./policy-gateway";
import { TaskWorker } from "./worker";
export declare const DEFAULT_API_URL = "https://api.sekuire.ai";
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
export declare class SekuireSDK {
    private config;
    private identity;
    private logger;
    private client;
    private beacon;
    private isRunning;
    private credentialsStore;
    private policyGateway;
    constructor(config: SekuireSDKConfig);
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
    }): SekuireSDK;
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
    start(): Promise<void>;
    /**
     * Check if the beacon is connected and sending heartbeats.
     *
     * @returns True if the beacon has successfully bootstrapped
     */
    isConnected(): boolean;
    /**
     * Log an event to Sekuire.
     *
     * @param eventType Type of event (tool_execution, model_call, policy_check, etc.)
     * @param data Event-specific data
     * @param severity Severity level (debug, info, warn, error)
     */
    log(eventType: EventType, data: Record<string, unknown>, severity?: Severity): void;
    /**
     * Check if an action is allowed by the workspace policy.
     *
     * @param action The action to check (e.g., "read_file", "network_access")
     * @param context Context for the action (e.g., {path: "/etc/passwd"})
     * @returns True if allowed, False if denied
     */
    checkPolicy(action: string, context: Record<string, unknown>): Promise<boolean>;
    /**
     * Shutdown the SDK gracefully.
     */
    shutdown(): Promise<void>;
    /**
     * Get the current beacon status (heartbeat health, connection info).
     */
    getBeaconStatus(): BeaconStatus;
    /**
     * Get runtime credentials after SDK has started.
     *
     * Use this to share credentials with TaskWorker to avoid dual bootstrap
     * token consumption. The SDK must be started first.
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
    getInstallationCredentials(): InstallationCredentials | null;
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
    }): TaskWorker;
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
    }): A2ATaskDelegator;
    /**
     * Get the agent ID.
     */
    get agentId(): string;
    /**
     * Get the agent's public key.
     */
    get publicKey(): string | undefined;
    /**
     * Sign a message with the agent's private key.
     */
    sign(message: string): Promise<string>;
    /**
     * Verify a signature using the agent's public key.
     */
    verify(message: string, signature: string): boolean;
    /**
     * Get the underlying identity object.
     */
    getIdentity(): AgentIdentity;
    /**
     * Get the underlying logger object.
     */
    getLogger(): SekuireLogger;
    getPolicyGateway(): PolicyGateway | null;
}
