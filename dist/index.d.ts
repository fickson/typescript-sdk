import * as z from 'zod';

interface ActivePolicy {
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
declare class PolicyClient {
    private readonly baseUrl;
    private cache;
    constructor(baseUrl: string);
    invalidateCache(workspaceId: string): void;
    fetchActivePolicy(workspaceId: string): Promise<ActivePolicy>;
    verify(policy: ActivePolicy): void;
}

interface ActivePolicyResponse {
    policy_id: string;
    workspace_id: string;
    version: string;
    status: string;
    hash: string;
    content: unknown;
    activated_at?: string;
    updated_at?: string;
    signature?: string;
    signing_key_id?: string;
    signing_public_key?: string;
}
interface CustomRule {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    priority?: number;
    scope: {
        capabilities: string[];
        agents?: string[];
    };
    conditions: RuleCondition[];
    logic: "any" | "all";
    action: "deny" | "warn";
    message: string;
}
interface RuleCondition {
    field: string;
    operator: ConditionOperator;
    value: unknown;
    case_sensitive?: boolean;
}
type ConditionOperator = "contains" | "not_contains" | "equals" | "not_equals" | "starts_with" | "ends_with" | "matches" | "in" | "not_in" | "greater_than" | "less_than";
interface PolicyDecision {
    allowed: boolean;
    violations: PolicyViolation[];
    warnings: PolicyViolation[];
}
interface PolicyViolation {
    rule_id: string;
    rule_name: string;
    message: string;
    capability: string;
}
interface RateLimitsConfig$1 {
    per_agent?: PerAgentLimits;
}
interface PerAgentLimits {
    requests_per_minute?: number;
    requests_per_hour?: number;
    tokens_per_minute?: number;
}

declare class PolicyGateway {
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

/**
 * A2A Protocol Type Definitions
 *
 * Types implementing the A2A Protocol specification for agent interoperability.
 * See: https://github.com/a2aproject/A2A
 */
/** Full A2A-compliant Agent Card */
interface AgentCard {
    /** Unique agent identifier (e.g., "sekuire:workspace:agent-name") */
    agentId: string;
    /** Human-readable agent name */
    name: string;
    /** Agent description */
    description: string;
    /** Semantic version */
    version: string;
    /** Provider information */
    provider?: AgentProvider;
    /** Supported A2A protocol versions */
    protocolVersions: string[];
    /** Agent capabilities */
    capabilities: AgentCapabilities;
    /** Skills the agent provides */
    skills: AgentSkill[];
    /** Default input MIME types accepted */
    defaultInputModes?: string[];
    /** Default output MIME types produced */
    defaultOutputModes?: string[];
    /** Security schemes supported */
    securitySchemes?: Record<string, SecurityScheme>;
    /** Required security scheme names */
    security?: string[];
    /** Base URL for A2A endpoints */
    url: string;
}
/** Provider information */
interface AgentProvider {
    name: string;
    url?: string;
}
/** Agent capabilities */
interface AgentCapabilities {
    /** Supports streaming responses via SSE */
    streaming: boolean;
    /** Supports push notifications */
    pushNotifications: boolean;
    /** Supports extended agent card endpoint */
    extendedAgentCard: boolean;
}
/** Security scheme definition */
interface SecurityScheme {
    type: string;
    scheme?: string;
    bearerFormat?: string;
}
/** Structured skill definition */
interface AgentSkill {
    /** Skill identifier (e.g., "document:summarize") */
    id: string;
    /** Human-readable skill name */
    name: string;
    /** Skill description */
    description?: string;
    /** Tags for categorization */
    tags?: string[];
    /** Input MIME types accepted */
    inputModes?: string[];
    /** Output MIME types produced */
    outputModes?: string[];
    /** Example prompts */
    examples?: string[];
}
/** A2A message with role and parts */
interface A2AMessage {
    /** Message role: "user" or "agent" */
    role: 'user' | 'agent';
    /** Message content parts */
    parts: A2AMessagePart[];
}
/** Message part content */
type A2AMessagePart = {
    type: 'text';
    text: string;
} | {
    type: 'file';
    uri: string;
    mimeType?: string;
} | {
    type: 'data';
    data: unknown;
};
/** A2A task states (aligned with A2A protocol spec) */
type A2ATaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled' | 'rejected' | 'auth-required';
/** A2A task status with timestamp */
interface A2ATaskStatus {
    state: A2ATaskState;
    timestamp: string;
}
/** Full A2A task */
interface A2ATask {
    taskId: string;
    contextId?: string;
    status: A2ATaskStatus;
    artifacts: A2AArtifact[];
    history: A2AMessage[];
    /** ID of the task that delegated to this task */
    parentTaskId?: string;
    /** Trace ID shared across the delegation chain */
    traceId?: string;
}
/** Task artifact output */
interface A2AArtifact {
    name?: string;
    parts: A2AMessagePart[];
    index?: number;
}
/** Request for skill-based auto-discovery routing */
interface A2ARouteRequest {
    /** Required skill (e.g., "document:summarize") */
    skill: string;
    /** Message to send to the agent */
    message: A2AMessage;
    /** Optional conversation context ID */
    contextId?: string;
    /** Parent task ID for delegation tracking */
    parentTaskId?: string;
    /** Trace ID for the entire delegation chain */
    traceId?: string;
}
/** Response from skill-based routing */
interface A2ARouteResponse {
    /** Created task ID */
    taskId: string;
    /** Current task status */
    status: A2ATaskState;
    /** ID of the selected agent */
    agentId: string;
    /** Initial response message (if any) */
    message?: A2AMessage;
    /** Trace ID for the delegation chain */
    traceId?: string;
}
/** JSON-RPC 2.0 Request */
interface JsonRpcRequest {
    jsonrpc: '2.0';
    method: string;
    id: string | number;
    params?: unknown;
}
/** JSON-RPC 2.0 Response */
interface JsonRpcResponse<T = unknown> {
    jsonrpc: '2.0';
    id: string | number;
    result?: T;
    error?: JsonRpcError;
}
/** JSON-RPC 2.0 Error */
interface JsonRpcError {
    code: number;
    message: string;
    data?: unknown;
}
/** Parameters for tasks/send method */
interface TasksSendParams {
    /** Optional existing task ID to continue */
    taskId?: string;
    /** Message to send */
    message: A2AMessage;
    /** Optional context ID for grouping tasks */
    contextId?: string;
}
/** Parameters for tasks/get method */
interface TasksGetParams {
    taskId: string;
}
/** Parameters for tasks/cancel method */
interface TasksCancelParams {
    taskId: string;
}
/** Parameters for tasks/sendSubscribe method */
interface TasksSendSubscribeParams {
    /** Optional existing task ID to continue */
    taskId?: string;
    /** Message to send */
    message: A2AMessage;
}
/** SSE task update event */
interface TaskUpdateEvent {
    taskId: string;
    status: A2ATaskState;
    updatedAt: string;
    message?: A2AMessage;
    artifacts?: A2AArtifact[];
}

/**
 * A2A Task Delegator
 *
 * Enables agents to delegate tasks to other agents and receive completion callbacks.
 * Provides a complete feedback loop for multi-agent orchestration.
 */

interface DelegatorConfig {
    apiUrl: string;
    authToken: string;
    workspaceId: string;
    agentId: string;
    timeout?: number;
    pollInterval?: number;
    maxRetries?: number;
    retryDelayMs?: number;
    retryBackoffMultiplier?: number;
    policyGateway?: PolicyGateway;
    tokenResolver?: () => string | undefined;
    onUnauthorized?: () => Promise<void>;
}
interface DelegationRequest {
    skill: string;
    message: string | A2AMessage;
    contextId?: string;
    parentTaskId?: string;
    traceId?: string;
    timeout?: number;
    onProgress?: (event: TaskUpdateEvent) => void;
    /** Direct URL for auto-fallback when routed mode fails */
    targetUrl?: string;
    /** Target agent ID for task registration in fallback mode */
    targetAgentId?: string;
}
interface DelegationResult {
    taskId: string;
    agentId: string;
    traceId?: string;
    status: A2ATaskState;
    result?: A2AMessage;
    artifacts?: Array<{
        name?: string;
        parts: Array<{
            type: string;
            text?: string;
        }>;
    }>;
    error?: string;
    executionTimeMs: number;
}
declare class A2ATaskDelegator {
    private client;
    private config;
    private activeDelegations;
    private policyGateway?;
    constructor(config: DelegatorConfig);
    setRuntimeToken(token: string): void;
    delegate(request: DelegationRequest): Promise<DelegationResult>;
    private isRetryableError;
    private delegateOnce;
    delegateWithStreaming(request: DelegationRequest): AsyncGenerator<TaskUpdateEvent, DelegationResult>;
    private delegateDirect;
    private completeRegisteredTaskAndWarn;
    cancelDelegation(taskId: string): void;
    cancelAllDelegations(): void;
    discoverAgents(skill: string): Promise<Array<{
        agentId: string;
        name: string;
    }>>;
    private waitForCompletion;
    private pollForCompletion;
    private sleep;
}
declare function createDelegator(config: DelegatorConfig): A2ATaskDelegator;

interface RuntimeCredentials {
    installationId?: string;
    runtimeToken?: string;
    refreshToken?: string;
    expiresAt?: string;
}
interface BootstrapResponseData {
    installation_id: string;
    runtime_token: string;
    refresh_token?: string;
    expires_at: string;
}
interface BootstrapTarget {
    installationId: string | null;
    runtimeToken: string | null;
    refreshToken: string | null;
    credentialsStore?: RuntimeCredentialsStore | null;
}
declare function applyBootstrapResponse(target: BootstrapTarget, data: BootstrapResponseData): void;
declare class RuntimeCredentialsStore {
    private installationId?;
    private runtimeToken?;
    private refreshToken?;
    private expiresAt?;
    private apiBaseUrl?;
    private inflightRefresh;
    constructor(initial?: RuntimeCredentials & {
        apiBaseUrl?: string;
    });
    setApiBaseUrl(url: string): void;
    update(partial: RuntimeCredentials): void;
    setRuntimeToken(runtimeToken: string, expiresAt?: string): void;
    setInstallationId(installationId: string): void;
    setRefreshToken(refreshToken: string): void;
    getInstallationId(): string | undefined;
    getRuntimeToken(): string | undefined;
    getRefreshToken(): string | undefined;
    getExpiresAt(): string | undefined;
    getAll(): RuntimeCredentials;
    hasRecoveryCredentials(): boolean;
    hasRuntimeToken(): boolean;
    refreshRuntimeToken(caller?: string): Promise<void>;
    private doRefresh;
}

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

interface BeaconConfig {
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
interface BeaconStatus {
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
interface InstallationCredentials {
    installationId: string;
    runtimeToken: string;
    refreshToken: string;
    expiresAt?: string;
}
interface BootstrapResponse {
    installation_id: string;
    runtime_token: string;
    refresh_token?: string;
    expires_at: string;
    heartbeat_interval: number;
}
declare class Beacon {
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
declare function createBeacon(config: BeaconConfig): Beacon;

declare class AgentIdentity {
    readonly name: string;
    readonly sekuireId: string;
    private readonly privateKey?;
    readonly publicKey?: string | undefined;
    constructor(name: string, sekuireId: string, privateKey?: string | undefined, publicKey?: string | undefined);
    static load(manifestPath?: string): Promise<AgentIdentity>;
    /**
     * Sign a message using Ed25519
     * @param message The message string to sign
     * @returns Hex-encoded signature
     */
    sign(message: string): Promise<string>;
    /**
     * Verify a signature (useful for testing)
     */
    verify(message: string, signatureHex: string): boolean;
}

type EventType = "tool_execution" | "model_call" | "policy_violation" | "policy_check" | "network_access" | "file_access" | "health";
type Severity = "debug" | "info" | "warn" | "error";
type FallbackMode = "console" | "file" | "silent";
interface LoggerConfig$1 {
    sekuireId: string;
    apiBaseUrl?: string;
    apiKey?: string;
    sessionId?: string;
    workspaceId?: string;
    environment?: string;
    enabled?: boolean;
    batchSize?: number;
    flushInterval?: number;
    maxRetries?: number;
    retryBaseDelay?: number;
    onError?: (error: Error, context: {
        operation: string;
        eventsLost?: number;
    }) => void;
    fallback?: FallbackMode;
    fallbackFilePath?: string;
    maxBufferSize?: number;
}
interface EventLog {
    sekuire_id: string;
    session_id: string;
    workspace_id?: string;
    event_type: EventType;
    severity: Severity;
    event_timestamp: string;
    event_data: Record<string, any>;
    metadata: Record<string, any>;
}
declare class SekuireLogger {
    private config;
    private buffer;
    private retryQueue;
    private overflowEventsTotal;
    private flushTimer?;
    private heartbeatTimer?;
    private isFlushing;
    private client;
    private readonly sdkVersion;
    private readonly apiAvailable;
    private readonly fallbackMode;
    private readonly maxBufferSize;
    private readonly maxRetries;
    private readonly retryBaseDelay;
    constructor(config: LoggerConfig$1);
    logEvent(eventType: EventType, severity: Severity, eventData: Record<string, any>): void;
    flush(): Promise<void>;
    private sendBatch;
    private processRetryQueue;
    private writeFallback;
    private writeFallbackToFile;
    private sendHealthHeartbeat;
    private startFlushTimer;
    private startHeartbeatTimer;
    private stopTimers;
    shutdown(): Promise<void>;
    getStatus(): {
        enabled: boolean;
        bufferedEvents: number;
        sessionId: string;
        environment: string;
        apiAvailable: boolean;
        fallbackMode: FallbackMode;
        overflowEventsTotal: number;
        retryQueueSize: number;
    };
    setEnabled(enabled: boolean): void;
}

/**
 * Sekuire Task Worker
 *
 * Handles SSE connection to Core for real-time task delivery.
 * Provides `onTask()` API for agents to register task handlers.
 */

interface TaskEvent {
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
interface TaskContext {
    taskId: string;
    workspaceId: string;
    requesterId?: string;
    parentTaskId?: string;
    traceId?: string;
    workflowId?: string;
}
type TaskHandler = (ctx: TaskContext, input: Record<string, unknown>) => Promise<unknown>;
interface WorkerConfig {
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
declare class TaskWorker {
    private eventSource;
    private handlers;
    private config;
    private heartbeatInterval;
    private reconnectDelay;
    private isConnected;
    private isPaused;
    private installationId;
    private runtimeToken;
    private refreshToken;
    private expiresAt;
    private onCommandCallback?;
    private recoveredFromEnv;
    private credentialsStore?;
    private tokenProvider?;
    private policyGateway?;
    private degradedMode;
    constructor(config: WorkerConfig);
    private getEnvVar;
    /**
     * Register a handler for a specific capability
     */
    onTask(capability: string, handler: TaskHandler): this;
    /**
     * Start the worker (connects to SSE stream and starts heartbeat)
     *
     * Authentication priority:
     * 1. If runtimeToken is provided, use it directly
     * 2. If installationId + refreshToken are set, recover credentials
     * 3. Fall back to installToken for fresh bootstrap
     */
    start(): Promise<void>;
    /**
     * Try to recover credentials using installation ID and refresh token.
     */
    private tryCredentialRecovery;
    /**
     * Stop the worker gracefully
     */
    stop(): Promise<void>;
    /**
     * Check if the worker is currently paused
     */
    getIsPaused(): boolean;
    /**
     * Register a callback for control commands
     */
    onCommand(callback: (cmd: {
        type: string;
        reason?: string;
    }) => void): this;
    /**
     * Handle control commands from SSE or heartbeat fallback
     */
    private handleCommand;
    /**
     * Get runtime token for API calls
     */
    private getToken;
    /**
     * Connect to SSE stream
     */
    private connect;
    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect;
    /**
     * Handle incoming task
     */
    private handleTask;
    /**
     * Report task completion to Core
     */
    private completeTask;
    /**
     * Register this agent installation with Sekuire using install_token
     * Returns runtime_token for subsequent API calls
     */
    private bootstrap;
    /**
     * Start heartbeat/lease renewal loop
     */
    private startHeartbeat;
    /**
     * Refresh the runtime token using the refresh token
     */
    private refreshRuntimeToken;
    private getInstallationId;
    private getRefreshToken;
}
declare function createWorker(config: WorkerConfig): TaskWorker;

/**
 * SekuireSDK - Main SDK entry point for TypeScript agents
 *
 * Combines identity, logging, and heartbeat functionality with a simple API.
 */

declare const DEFAULT_API_URL = "https://api.sekuire.ai";
interface SekuireSDKConfig {
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
declare class SekuireSDK {
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

/**
 * 🛡️ Sekuire Compliance Enforcement System for TypeScript
 *
 * Runtime compliance enforcement that blocks all unauthorized behavior.
 * Everything blocked unless explicitly allowed in sekuire.yaml.
 */

interface ComplianceViolation {
    timestamp: Date;
    category: string;
    message: string;
    details: Record<string, any>;
    agentId: string;
}
declare class ComplianceError extends Error {
    readonly category: string;
    readonly details: Record<string, any>;
    constructor(message: string, category?: string, details?: Record<string, any>);
}
declare class NetworkComplianceError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
declare class FileAccessError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
declare class ToolUsageError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
declare class ContentPolicyError extends ComplianceError {
    constructor(message: string, details?: Record<string, any>);
}
/**
 * 🔒 Runtime compliance enforcement system
 *
 * Enforces all rules defined in sekuire.yaml:
 * - Network access control
 * - File system restrictions
 * - Tool usage limits
 * - Content filtering
 * - Environment variable access
 */
declare class ComplianceMonitor {
    private configPath;
    private config;
    private violations;
    private logger?;
    private networkAllowSet;
    private networkBlockSet;
    private filesReadSet;
    private filesWriteSet;
    private filesBlockPatterns;
    private envAllowSet;
    private envBlockSet;
    private allowedToolsSet;
    private toolBlockPatterns;
    private inputBlockPatterns;
    private outputBlockPatterns;
    private allowedModelsSet;
    private networkCache;
    private contentCache;
    private readonly maxCacheSize;
    constructor(configPath?: string, logger?: SekuireLogger);
    private loadConfig;
    private buildIndexes;
    private loadAllowedTools;
    /**
     * 🌐 Check if network access is allowed
     *
     * @param url Target URL
     * @param method HTTP method (GET, POST, etc.)
     * @throws NetworkComplianceError If access is blocked
     */
    checkNetworkAccess(url: string, method?: string): boolean;
    /**
     * Create a safe fetch function with compliance enforcement
     */
    createSafeFetch(originalFetch?: typeof fetch): typeof fetch;
    /**
     * 📁 Check if file access is allowed
     *
     * @param filePath File path
     * @param mode 'read', 'write', 'execute'
     * @throws FileAccessError If access is blocked
     */
    checkFileAccess(filePath: string, mode?: "read" | "write" | "execute"): boolean;
    /**
     * Safe file reading with compliance check
     */
    safeReadFile(filePath: string, encoding?: BufferEncoding): string;
    /**
     * Safe file writing with compliance check
     */
    safeWriteFile(filePath: string, data: string | Buffer, encoding?: BufferEncoding): void;
    /**
     * 🔐 Check if environment variable access is allowed
     *
     * @param varName Environment variable name
     * @throws ComplianceError If access is blocked
     */
    checkEnvAccess(varName: string): boolean;
    /**
     * Safe environment variable access
     */
    safeGetEnv(varName: string, defaultValue?: string): string | undefined;
    /**
     * 🛠️ Check if tool usage is allowed
     *
     * @param toolName Name of the tool
     * @param codeSnippet Code snippet for pattern checking
     * @throws ToolUsageError If tool usage is blocked
     */
    checkToolUsage(toolName: string, codeSnippet?: string): void;
    /**
     * 💬 Check input content for policy violations
     *
     * @param content Input content to check
     * @throws ContentPolicyError If content violates policy
     */
    checkInputContent(content: string): void;
    /**
     * 📤 Check output content for policy violations
     *
     * @param content Output content to check
     * @throws ContentPolicyError If content violates policy
     */
    checkOutputContent(content: string): void;
    private checkContent;
    /**
     * 🤖 Check AI model usage compliance
     *
     * @param model Model name
     * @param temperature Temperature setting
     * @param maxTokens Max tokens setting
     * @throws ComplianceError If model usage violates rules
     */
    checkModelUsage(model: string, temperature?: number, maxTokens?: number): boolean;
    /**
     * 🔢 Generate BLAKE3 hash for content integrity checking
     */
    hashContent(content: string): string;
    /**
     * Verify file hasn't been modified
     */
    checkFileIntegrity(filePath: string, expectedHash: string): boolean;
    /**
     * Log compliance violation
     */
    private logViolation;
    /**
     * 🚨 Send security alert to monitoring systems
     */
    private sendSecurityAlert;
    /**
     * 📊 Get current compliance status and statistics
     */
    getComplianceStatus(): Record<string, any>;
    /**
     * Get recent violations
     */
    getViolations(category?: string, limit?: number): ComplianceViolation[];
    /**
     * Clear violation log
     */
    clearViolations(): void;
    /**
     * Set cache value with size limit
     */
    private setCacheValue;
    /**
     * Pre-warm caches with common operations
     */
    preWarmCaches(): void;
}

/**
 * Sekuire Agent Framework
 *
 * High-level API for building compliant AI agents with automatic
 * identity verification, compliance enforcement, and event logging.
 */

interface SekuireAgentConfig {
    /** Agent identity (sekuire.json) */
    identity?: AgentIdentity;
    /** Compliance configuration file path */
    configPath?: string;
    /** Logger configuration */
    logger?: {
        apiBaseUrl?: string;
        environment?: string;
        enabled?: boolean;
    };
    /** Optional custom compliance monitor */
    compliance?: ComplianceMonitor;
}
interface ToolDefinition$2<T extends z.ZodObject<any> = any> {
    /** Unique tool name */
    name: string;
    /** Human-readable description */
    description: string;
    /** Zod schema for input validation */
    schema: T;
    /** Tool execution function */
    execute: (input: z.infer<T>) => Promise<unknown> | unknown;
    /** Optional: Additional compliance checks */
    beforeExecute?: (input: z.infer<T>) => Promise<void> | void;
}
interface Message$1 {
    role: "user" | "assistant" | "system";
    content: string;
}
interface AgentInvokeOptions {
    messages: Message$1[];
    tools?: string[];
}
interface AgentResponse$1 {
    message: string;
    toolCalls?: ToolCall[];
    metadata?: {
        tokensUsed?: number;
        toolsInvoked?: string[];
        complianceViolations?: number;
    };
}
interface ToolCall {
    tool: string;
    input: any;
    output: any;
    allowed: boolean;
    reason?: string;
}
declare class SekuireAgent$1 {
    private identity;
    private compliance;
    private logger;
    private tools;
    constructor(identity: AgentIdentity, compliance: ComplianceMonitor, logger: SekuireLogger);
    /**
     * Get agent identity
     */
    getIdentity(): AgentIdentity;
    /**
     * Get compliance monitor
     */
    getCompliance(): ComplianceMonitor;
    /**
     * Get logger
     */
    getLogger(): SekuireLogger;
    /**
     * Register a tool with the agent
     */
    registerTool<T extends z.ZodObject<any>>(tool: ToolDefinition$2<T>): this;
    /**
     * Register multiple tools at once
     */
    registerTools(tools: ToolDefinition$2[]): this;
    /**
     * Get registered tools
     */
    getTools(names?: string[]): ToolDefinition$2[];
    /**
     * Execute a tool by name
     */
    executeTool(name: string, input: any): Promise<any>;
    /**
     * Invoke the agent (to be implemented by subclasses or plugins)
     */
    invoke(options: AgentInvokeOptions): Promise<AgentResponse$1>;
    /**
     * Shutdown agent and flush logs
     */
    shutdown(): Promise<void>;
}
declare class SekuireAgentBuilder {
    private config;
    private tools;
    /**
     * Set agent identity
     */
    withIdentity(identity: AgentIdentity): this;
    /**
     * Load identity from disk
     */
    loadIdentity(path?: string): Promise<this>;
    /**
     * Set compliance config path
     */
    withConfig(path: string): this;
    /**
     * Set logger options
     */
    withLogger(options: NonNullable<SekuireAgentConfig["logger"]>): this;
    /**
     * Add a tool
     */
    withTool<T extends z.ZodObject<any>>(tool: ToolDefinition$2<T>): this;
    /**
     * Add multiple tools
     */
    withTools(tools: ToolDefinition$2[]): this;
    /**
     * Build the agent
     */
    build(): Promise<SekuireAgent$1>;
}
/**
 * Create a new Sekuire agent with compliance and identity
 *
 * @example
 * ```typescript
 * const agent = await createAgent({
 *   configPath: './sekuire.yaml',
 *   tools: [weatherTool, calculatorTool],
 * });
 * ```
 */
declare function createAgent(config?: {
    identity?: AgentIdentity;
    configPath?: string;
    tools?: ToolDefinition$2[];
    logger?: SekuireAgentConfig["logger"];
}): Promise<SekuireAgent$1>;
/**
 * Create a compliant tool definition
 *
 * @example
 * ```typescript
 * const weatherTool = tool({
 *   name: 'get_weather',
 *   description: 'Get weather for a city',
 *   schema: z.object({
 *     city: z.string(),
 *   }),
 *   execute: async ({ city }) => {
 *     return `Weather in ${city}: Sunny`;
 *   },
 * });
 * ```
 */
declare function tool<T extends z.ZodObject<any>>(definition: ToolDefinition$2<T>): ToolDefinition$2<T>;
/**
 * Create multiple tools at once
 *
 * @example
 * ```typescript
 * const [weather, calc] = tools(
 *   { name: 'weather', ... },
 *   { name: 'calculator', ... }
 * );
 * ```
 */
declare function tools<T extends ToolDefinition$2[]>(...definitions: T): T;
/**
 * Get tools registered with an agent
 */
declare function getTools$1(agent: SekuireAgent$1, names?: string[]): ToolDefinition$2[];

interface Manifest {
    project: ProjectMetadata;
    identity: IdentityConfig;
}
interface ProjectMetadata {
    name: string;
    version: string;
    description?: string;
    authors: string[];
    license?: string;
}
interface IdentityConfig {
    /** The model identifier (e.g., "gpt-4-0613") */
    model: string;
    /** Path to the system prompt file (relative to sekuire.json) */
    systemPromptPath: string;
    /** Path to the tools definition file (relative to sekuire.json) */
    toolsPath: string;
    /** The Blake3 hash of the system prompt content */
    systemPromptHash?: string;
    /** The Blake3 hash of the tools definition content */
    toolsHash?: string;
}
interface PublishRequest {
    manifest: Manifest;
    sekuireId: string;
    signature: string;
    publicKey: string;
}
interface AgentResponse {
    sekuireId: string;
    name: string;
    version: string;
    description?: string;
    authorKey: string;
    createdAt: string;
    verificationStatus: VerificationStatus;
    reputationScore: number;
}
type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'suspended';
interface ReputationResponse {
    score: number;
    taskCount: number;
    verificationBadge?: string;
    recentLogs: ReputationLog[];
}
interface ReputationLog {
    id: string;
    taskHash: string;
    rating: number;
    comment?: string;
    timestamp: string;
}
interface SubmitReputationRequest {
    sekuireId: string;
    taskHash: string;
    rating: number;
    comment?: string;
    signature: string;
}

interface HandshakeHello {
    clientNonce: string;
}
interface HandshakeWelcome {
    agentId: string;
    agentNonce: string;
    signatureC: string;
    credentials: string[];
}
interface HandshakeAuth {
    signatureA: string;
}
interface VerifyAgentRequest {
    sekuireId: string;
    status: VerificationStatus;
    badge?: string;
    reason?: string;
}
interface DisputeRequest {
    sekuireId: string;
    accuserId: string;
    reason: string;
    evidenceLog: string;
}
interface CreateOrgRequest {
    slug: string;
    displayName: string;
    billingEmail: string;
}
interface OrgResponse {
    id: string;
    slug: string;
    role: string;
}
interface CreateWorkspaceRequest {
    name: string;
    policyPreset: string;
}
interface WorkspaceResponse {
    id: string;
    name: string;
}
interface InviteRequest {
    email: string;
    role: string;
}
interface InviteResponse {
    id: string;
    status: string;
}
interface UserContextResponse {
    id: string;
    email: string;
    onboarded: boolean;
    mfa_enabled: boolean;
    role?: string;
    full_name?: string;
    avatar_url?: string;
    onboarding_step?: number;
    profile_completed?: boolean;
    orgs: OrgSummary[];
    workspaces: WorkspaceSummary[];
}
interface OrgSummary {
    id: string;
    slug: string;
    workspaces?: WorkspaceSummary[];
}
interface WorkspaceSummary {
    id: string;
    name: string;
    org_id: string;
}
interface SekuireClientConfig {
    registryUrl: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
}
interface KeyPair {
    publicKey: string;
    privateKey: string;
}
interface HandshakeResult {
    agentId: string;
    verified: boolean;
    credentials: string[];
}
declare class SekuireError extends Error {
    readonly code: string;
    readonly details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
declare class NetworkError extends SekuireError {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
declare class ProtocolError extends SekuireError {
    readonly statusCode?: number | undefined;
    constructor(message: string, statusCode?: number | undefined);
}
declare class CryptoError extends SekuireError {
    constructor(message: string);
}
declare class PolicyViolationError extends SekuireError {
    readonly rule: string;
    constructor(message: string, rule: string);
}
type HexString = string;
type AgentId = string;

/**
 * Sekuire client for verifying agents and performing handshakes
 */
declare class SekuireClient {
    private readonly keyPair;
    private readonly httpClient;
    constructor(keyPair: KeyPair, config: SekuireClientConfig);
    /**
     * Perform the full handshake with a remote agent
     */
    connect(agentUrl: string, expectedAgentId?: string): Promise<HandshakeResult>;
    /**
     * Verify an agent's signature
     */
    private verifyAgentSignature;
    /**
     * Fetch agent's public key from the registry
     */
    fetchAgentPublicKey(agentId: string): Promise<string>;
    /**
     * Get agent information from the registry
     */
    getAgentInfo(agentId: string): Promise<AgentResponse>;
    /**
     * Search for agents in the registry
     */
    searchAgents(query: string): Promise<AgentResponse[]>;
    /**
     * Sign data with the client's private key
     */
    sign(data: string): string;
    /**
     * Get the client's public key
     */
    getPublicKey(): string;
}

interface RegistryClientConfig {
    apiUrl: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
}
interface PublishAgentOptions {
    manifest: Manifest;
    privateKeyHex: string;
    systemPrompt: string;
    tools: string;
    publisherOrgId?: string;
    visibility?: "public" | "private" | "internal";
}
interface UpdateAgentOptions {
    manifest?: Partial<Manifest>;
    visibility?: "public" | "private" | "internal";
    gitRepository?: string;
}
interface SearchAgentsOptions {
    query?: string;
    tags?: string[];
    verificationStatus?: VerificationStatus;
    category?: string;
    limit?: number;
    offset?: number;
}
interface TaskCompletion {
    taskId: string;
    taskHash: string;
    rating: number;
    comment?: string;
    evidence?: string;
}
interface LeaderboardEntry {
    sekuireId: string;
    name: string;
    reputationScore: number;
    taskCount: number;
    verificationStatus: VerificationStatus;
    rank: number;
}
interface PublishResponse {
    sekuireId: string;
    name: string;
    version: string;
    verificationStatus: VerificationStatus;
    createdAt: string;
}
interface DisputeResponse {
    id: string;
    sekuireId: string;
    status: "pending" | "reviewing" | "resolved" | "rejected";
    createdAt: string;
}
interface VerificationRequest {
    sekuireId: string;
    repositoryUrl?: string;
    commitHash?: string;
    complianceFramework?: string;
}
interface VerificationResult {
    passed: boolean;
    securityScore: number;
    complianceScore: number;
    issues: VerificationIssue[];
    timestamp: string;
}
interface VerificationIssue {
    severity: "critical" | "high" | "medium" | "low";
    category: string;
    message: string;
    file?: string;
    line?: number;
}
interface TrustHeadersRequest {
    agentId: string;
    action?: string;
    context?: Record<string, unknown>;
}
interface TrustHeaders {
    "X-Sekuire-Agent-ID": string;
    "X-Sekuire-Reputation": string;
    "X-Sekuire-Verification": string;
    "X-Sekuire-Badges": string;
    "X-Sekuire-Timestamp": string;
    "X-Sekuire-Signature": string;
}
declare class SekuireRegistryClient {
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
declare function createRegistryClient(apiUrl: string, authToken?: string, apiKey?: string): SekuireRegistryClient;

interface SekuireConfig {
    project: {
        name: string;
        version: string;
        description?: string;
        author?: string;
        license?: string;
    };
    agents?: {
        [key: string]: AgentConfig;
    };
    agent?: AgentConfig;
    llm?: LLMConfig;
    logger?: LoggerConfig;
    permissions?: PermissionsConfig;
    rate_limits?: RateLimitsConfig;
}
interface PermissionsConfig {
    network?: {
        enabled?: boolean;
        require_tls?: boolean;
        allowed_domains?: string[];
        blocked_domains?: string[];
    };
    filesystem?: {
        enabled?: boolean;
        allowed_paths?: string[];
        blocked_paths?: string[];
        allowed_extensions?: string[];
    };
    api?: {
        enabled?: boolean;
        allowed_services?: Array<{
            service_name: string;
            endpoints?: string[];
        }>;
    };
}
interface RateLimitsConfig {
    per_agent?: {
        requests_per_minute?: number;
        tokens_per_hour?: number;
    };
}
interface AgentConfig {
    name: string;
    system_prompt: string;
    tools: string;
    llm: LLMConfig;
    memory?: MemoryConfig;
    compliance?: ComplianceConfig;
    models?: {
        allowed_models?: string[];
        blocked_models?: string[];
    };
    toolsets?: {
        allowed_tools?: Array<{
            name: string;
            description?: string;
        }>;
        blocked_tools?: string[];
    };
}
interface LLMConfig {
    provider: string;
    model: string;
    api_key_env: string;
    temperature?: number;
    max_tokens?: number;
    streaming?: boolean;
    base_url?: string;
}
interface MemoryConfig {
    type: 'in-memory' | 'buffer' | 'redis' | 'postgres' | 'sqlite' | 'upstash' | 'cloudflare-kv' | 'cloudflare-d1' | 'dynamodb' | 'turso' | 'convex' | string;
    max_messages?: number;
    redis?: {
        url?: string;
        host?: string;
        port?: number;
        password?: string;
        db?: number;
        keyPrefix?: string;
    };
    postgres?: {
        connectionString?: string;
        host?: string;
        port?: number;
        database?: string;
        user?: string;
        password?: string;
        tableName?: string;
    };
    sqlite?: {
        filename: string;
        tableName?: string;
    };
    upstash?: {
        url: string;
        token: string;
        keyPrefix?: string;
    };
    cloudflareKV?: {
        namespaceId?: string;
        accountId?: string;
        apiToken?: string;
        keyPrefix?: string;
    };
    cloudflareD1?: {
        databaseId?: string;
        accountId?: string;
        apiToken?: string;
        tableName?: string;
    };
    dynamodb?: {
        tableName: string;
        region?: string;
        endpoint?: string;
        createTable?: boolean;
    };
    turso?: {
        url: string;
        authToken?: string;
        tableName?: string;
    };
    convex?: {
        url: string;
        adminKey?: string;
    };
    config?: Record<string, unknown>;
}
interface ComplianceConfig {
    framework?: string;
    audit_logging?: boolean;
    sensitive_data_detection?: boolean;
    require_approval?: string[];
}
interface LoggerConfig {
    api_base_url?: string;
    environment?: string;
    enabled?: boolean;
}
interface ToolsSchema {
    version: string;
    tools: ToolDefinition$1[];
}
interface ToolDefinition$1 {
    name: string;
    description: string;
    category?: string;
    schema: {
        type: string;
        properties: Record<string, unknown>;
        required?: string[];
    };
    implementation: string;
    permissions?: any;
    compliance?: any;
}
/**
 * Load sekuire.yml configuration file
 */
declare function loadConfig(configPath?: string): Promise<SekuireConfig>;
/**
 * Load system prompt from file
 */
declare function loadSystemPrompt(promptPath: string, basePath?: string): Promise<string>;
/**
 * Load tools configuration from JSON file
 */
declare function loadTools(toolsPath: string, basePath?: string): Promise<ToolsSchema>;
/**
 * Get agent configuration by name
 * Supports both single agent and multi-agent configs
 */
declare function getAgentConfig(config: SekuireConfig, agentName?: string): AgentConfig;

declare class SekuireCrypto {
    /**
     * Generate a new Ed25519 keypair
     */
    static generateKeyPair(): KeyPair;
    /**
     * Sign a message with a private key
     */
    static sign(message: string | Uint8Array, privateKeyHex: string): HexString;
    /**
     * Verify a signature
     */
    static verify(message: string | Uint8Array, signatureHex: string, publicKeyHex: string): boolean;
    /**
     * Calculate Blake3 hash of data
     */
    static hash(data: string | Uint8Array): HexString;
    /**
     * Calculate Sekuire ID using the canonical algorithm (V2).
     *
     * Matches the CLI reference implementation (auth.rs:243-250):
     *   fingerprint = "model:{model}|prompt:{BLAKE3(trim(prompt))}|tools:{BLAKE3(canonical_json(tools))}"
     *   sekuire_id  = BLAKE3(fingerprint)
     *
     * projectName and projectVersion are accepted for backwards compatibility
     * but are NOT used in the ID computation.
     */
    static calculateSekuireId(params: {
        model: string;
        systemPrompt: string;
        tools: string;
        projectName?: string;
        projectVersion?: string;
    }): HexString;
    /**
     * Canonical identity algorithm aligned with CLI (auth.rs:243-250).
     *
     * 1. promptHash  = BLAKE3(trim(systemPrompt))
     * 2. toolsHash   = BLAKE3(JSON.stringify(JSON.parse(tools)))  // canonical JSON
     * 3. fingerprint = "model:{model}|prompt:{promptHash}|tools:{toolsHash}"
     * 4. sekuireId   = BLAKE3(fingerprint)
     */
    static calculateSekuireIdV2(params: {
        model: string;
        systemPrompt: string;
        tools: string;
    }): HexString;
    /**
     * @deprecated Use calculateSekuireId (V2) instead. This legacy algorithm
     * concatenates all fields in a single pass and does not match the CLI.
     */
    static calculateSekuireIdLegacy(params: {
        model: string;
        systemPrompt: string;
        tools: string;
        projectName: string;
        projectVersion: string;
    }): HexString;
    /**
     * Generate a cryptographically secure random nonce (32 bytes)
     */
    static generateNonce(): HexString;
    /**
     * Convert hex string to Uint8Array
     */
    static hexToBytes(hex: string): Uint8Array;
    /**
     * Convert Uint8Array to hex string
     */
    static bytesToHex(bytes: Uint8Array): HexString;
    /**
     * Validate hex string format
     */
    static isValidHex(hex: string): boolean;
    /**
     * Validate Ed25519 public key format (32 bytes)
     */
    static isValidPublicKey(hex: string): boolean;
    /**
     * Validate Ed25519 private key format (64 bytes)
     */
    static isValidPrivateKey(hex: string): boolean;
    /**
     * Validate nonce format (32 bytes)
     */
    static isValidNonce(hex: string): boolean;
}

interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}
interface ToolCallFunction {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
interface Message {
    role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
    content: string | null;
    name?: string;
    tool_call_id?: string;
    tool_calls?: ToolCallFunction[];
}
interface ChatOptions {
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string[];
    stream?: boolean;
    tools?: ToolDefinition[];
}
interface ChatResponse {
    content: string;
    model: string;
    finish_reason?: string;
    tool_calls?: ToolCallFunction[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
/**
 * Streaming chunk from chat completion
 */
interface ChatChunk {
    content: string;
    finish_reason?: string;
}
/**
 * Base interface for LLM providers
 */
interface LLMProvider {
    /**
     * Send chat messages and get response
     */
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    /**
     * Stream chat response
     */
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    /**
     * Count tokens in text (approximate)
     */
    countTokens(text: string): number;
    /**
     * Get maximum context window size
     */
    getMaxTokens(): number;
    /**
     * Get provider name
     */
    getProviderName(): string;
    /**
     * Get model name
     */
    getModelName(): string;
}
/**
 * Configuration for creating LLM providers
 */
interface LLMProviderConfig {
    apiKey: string;
    model: string;
    baseUrl?: string;
    organization?: string;
    temperature?: number;
    maxTokens?: number;
}

declare abstract class BaseLLMProvider implements LLMProvider {
    protected model: string;
    protected maxTokens: number;
    constructor(config: LLMProviderConfig);
    abstract chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    abstract chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    abstract getProviderName(): string;
    protected abstract getMaxTokensForModel(model: string): number;
    countTokens(text: string): number;
    getMaxTokens(): number;
    getModelName(): string;
}

declare class AnthropicProvider extends BaseLLMProvider {
    private client;
    constructor(config: LLMProviderConfig);
    static create(config: LLMProviderConfig): Promise<AnthropicProvider>;
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    getProviderName(): string;
    protected getMaxTokensForModel(model: string): number;
}

declare class GoogleProvider extends BaseLLMProvider {
    private client;
    constructor(config: LLMProviderConfig);
    static create(config: LLMProviderConfig): Promise<GoogleProvider>;
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    getProviderName(): string;
    protected getMaxTokensForModel(model: string): number;
    private buildTools;
    private buildHistory;
}

declare class OllamaProvider extends BaseLLMProvider {
    private baseUrl;
    constructor(config: LLMProviderConfig);
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    getProviderName(): string;
    protected getMaxTokensForModel(_model: string): number;
}

declare class OpenAIProvider extends BaseLLMProvider {
    private client;
    constructor(config: LLMProviderConfig);
    static create(config: LLMProviderConfig): Promise<OpenAIProvider>;
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncGenerator<ChatChunk>;
    getProviderName(): string;
    protected getMaxTokensForModel(model: string): number;
}

/**
 * Create an LLM provider based on provider name
 */
declare function createLLMProvider(provider: string, config: LLMProviderConfig): Promise<LLMProvider>;
/**
 * Factory functions for easy LLM instantiation
 */
declare const llm: {
    openai: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => Promise<OpenAIProvider>;
    anthropic: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => Promise<AnthropicProvider>;
    google: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => Promise<GoogleProvider>;
    ollama: (config: Omit<LLMProviderConfig, "model"> & {
        model?: string;
    }) => OllamaProvider;
};

interface MemoryMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
}
interface MemoryStorage {
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    connect?(): Promise<void>;
    disconnect?(): Promise<void>;
    isConnected?(): boolean;
}
declare abstract class BaseMemoryStorage implements MemoryStorage {
    protected _connected: boolean;
    abstract add(sessionId: string, message: MemoryMessage): Promise<void>;
    abstract get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    abstract clear(sessionId: string): Promise<void>;
    abstract delete(sessionId: string): Promise<void>;
    abstract exists(sessionId: string): Promise<boolean>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
}

declare class InMemoryStorage extends BaseMemoryStorage {
    private storage;
    constructor();
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
}

interface PostgresConfig {
    connectionString?: string;
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    tableName?: string;
    lazyConnect?: boolean;
}
declare class PostgresStorage extends BaseMemoryStorage {
    private pool;
    private tableName;
    private config;
    private connectionPromise;
    constructor(config: PostgresConfig);
    connect(): Promise<void>;
    private initPool;
    private ensureConnected;
    private createTableIfNotExists;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface RedisConfig {
    host?: string;
    port?: number;
    password?: string;
    db?: number;
    url?: string;
    keyPrefix?: string;
    lazyConnect?: boolean;
}
declare class RedisStorage extends BaseMemoryStorage {
    private client;
    private keyPrefix;
    private config;
    private connectionPromise;
    constructor(config: RedisConfig);
    connect(): Promise<void>;
    private initClient;
    private ensureConnected;
    private getKey;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface SQLiteConfig {
    filename: string;
    tableName?: string;
    readonly?: boolean;
}
declare class SQLiteStorage extends BaseMemoryStorage {
    private db;
    private config;
    private tableName;
    private connectionPromise;
    constructor(config: SQLiteConfig);
    connect(): Promise<void>;
    private ensureTableExists;
    private ensureConnected;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface UpstashConfig {
    url: string;
    token: string;
    keyPrefix?: string;
}
declare class UpstashStorage extends BaseMemoryStorage {
    private client;
    private keyPrefix;
    private config;
    private connectionPromise;
    constructor(config: UpstashConfig);
    connect(): Promise<void>;
    private ensureConnected;
    private getKey;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface CloudflareKVConfig {
    binding?: any;
    accountId?: string;
    namespaceId?: string;
    apiToken?: string;
    keyPrefix?: string;
}
declare class CloudflareKVStorage extends BaseMemoryStorage {
    private binding;
    private config;
    private keyPrefix;
    private useRestApi;
    constructor(config: CloudflareKVConfig);
    private getKey;
    private kvGet;
    private kvPut;
    private kvDelete;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface CloudflareD1Config {
    binding?: any;
    accountId?: string;
    databaseId?: string;
    apiToken?: string;
    tableName?: string;
}
declare class CloudflareD1Storage extends BaseMemoryStorage {
    private binding;
    private config;
    private tableName;
    private useRestApi;
    private tableInitialized;
    constructor(config: CloudflareD1Config);
    private executeQuery;
    private ensureTableExists;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface DynamoDBConfig {
    tableName: string;
    region?: string;
    endpoint?: string;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    createTable?: boolean;
}
declare class DynamoDBStorage extends BaseMemoryStorage {
    private client;
    private docClient;
    private config;
    private connectionPromise;
    private tableReady;
    constructor(config: DynamoDBConfig);
    connect(): Promise<void>;
    private ensureTableExists;
    private ensureConnected;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface TursoConfig {
    url: string;
    authToken?: string;
    tableName?: string;
}
declare class TursoStorage extends BaseMemoryStorage {
    private client;
    private config;
    private tableName;
    private connectionPromise;
    private tableInitialized;
    constructor(config: TursoConfig);
    connect(): Promise<void>;
    private ensureTableExists;
    private ensureConnected;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}

interface ConvexConfig {
    url: string;
    adminKey?: string;
}
declare class ConvexStorage extends BaseMemoryStorage {
    private client;
    private config;
    private connectionPromise;
    constructor(config: ConvexConfig);
    connect(): Promise<void>;
    private ensureConnected;
    add(sessionId: string, message: MemoryMessage): Promise<void>;
    get(sessionId: string, limit?: number): Promise<MemoryMessage[]>;
    clear(sessionId: string): Promise<void>;
    delete(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    disconnect(): Promise<void>;
}
declare const CONVEX_SCHEMA_TEMPLATE = "\n// convex/schema.ts\nimport { defineSchema, defineTable } from \"convex/server\";\nimport { v } from \"convex/values\";\n\nexport default defineSchema({\n  sekuireMemory: defineTable({\n    sessionId: v.string(),\n    role: v.union(v.literal(\"user\"), v.literal(\"assistant\"), v.literal(\"system\")),\n    content: v.string(),\n    timestamp: v.number(),\n    metadata: v.optional(v.any()),\n  }).index(\"by_session\", [\"sessionId\", \"timestamp\"]),\n});\n";
declare const CONVEX_FUNCTIONS_TEMPLATE = "\n// convex/sekuireMemory.ts\nimport { mutation, query } from \"./_generated/server\";\nimport { v } from \"convex/values\";\n\nexport const add = mutation({\n  args: {\n    sessionId: v.string(),\n    role: v.union(v.literal(\"user\"), v.literal(\"assistant\"), v.literal(\"system\")),\n    content: v.string(),\n    timestamp: v.number(),\n    metadata: v.optional(v.any()),\n  },\n  handler: async (ctx, args) => {\n    await ctx.db.insert(\"sekuireMemory\", args);\n  },\n});\n\nexport const get = query({\n  args: {\n    sessionId: v.string(),\n    limit: v.optional(v.number()),\n  },\n  handler: async (ctx, args) => {\n    let query = ctx.db\n      .query(\"sekuireMemory\")\n      .withIndex(\"by_session\", (q) => q.eq(\"sessionId\", args.sessionId))\n      .order(\"asc\");\n\n    const messages = await query.collect();\n\n    if (args.limit) {\n      return messages.slice(-args.limit);\n    }\n    return messages;\n  },\n});\n\nexport const clear = mutation({\n  args: {\n    sessionId: v.string(),\n  },\n  handler: async (ctx, args) => {\n    const messages = await ctx.db\n      .query(\"sekuireMemory\")\n      .withIndex(\"by_session\", (q) => q.eq(\"sessionId\", args.sessionId))\n      .collect();\n\n    for (const message of messages) {\n      await ctx.db.delete(message._id);\n    }\n  },\n});\n\nexport const exists = query({\n  args: {\n    sessionId: v.string(),\n  },\n  handler: async (ctx, args) => {\n    const message = await ctx.db\n      .query(\"sekuireMemory\")\n      .withIndex(\"by_session\", (q) => q.eq(\"sessionId\", args.sessionId))\n      .first();\n    return message !== null;\n  },\n});\n";

type StorageFactory = (config: any) => MemoryStorage;
declare function registerStorage(type: string, factory: StorageFactory, description?: string): void;
declare function hasStorage(type: string): boolean;
declare function listStorageTypes(): string[];
declare function getStorageInfo(): Array<{
    type: string;
    description?: string;
}>;

type BuiltInMemoryType = 'in-memory' | 'buffer' | 'redis' | 'postgres' | 'sqlite' | 'upstash' | 'cloudflare-kv' | 'cloudflare-d1' | 'dynamodb' | 'turso' | 'convex';
type MemoryType = BuiltInMemoryType | string;
interface MemoryFactoryConfig {
    type: MemoryType;
    redis?: RedisConfig;
    postgres?: PostgresConfig;
    sqlite?: SQLiteConfig;
    upstash?: UpstashConfig;
    cloudflareKV?: CloudflareKVConfig;
    cloudflareD1?: CloudflareD1Config;
    dynamodb?: DynamoDBConfig;
    turso?: TursoConfig;
    convex?: ConvexConfig;
    options?: Record<string, unknown>;
    instance?: MemoryStorage;
}
declare function createMemoryStorage(config: MemoryFactoryConfig): MemoryStorage;

type ViolationHandler = (rule: string, reason: string) => void;
declare class PolicyEnforcer {
    private readonly policy;
    private readonly onViolation?;
    private readonly override;
    private rateLimitWindows;
    constructor(policy: ActivePolicy, override?: boolean, onViolation?: ViolationHandler | undefined);
    enforceNetwork(domain: string, protocol: string): void;
    enforceFilesystem(path: string, operation: string): void;
    enforceTool(toolName: string): void;
    private getCategoryPrefix;
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

/**
 * Options for overriding agent configuration
 */
interface AgentOptions {
    llm?: LLMProvider;
    tools?: ToolDefinition$1[];
    memory?: MemoryStorage;
    systemPrompt?: string;
    policyPath?: string;
}
/**
 * Sekuire Agent - Config-first AI agent
 */
declare class SekuireAgent {
    readonly name: string;
    private llm;
    private systemPrompt;
    private tools;
    private sessionId;
    private memory?;
    private maxHistoryMessages;
    private policyEnforcer?;
    constructor(config: {
        name: string;
        llm: LLMProvider;
        systemPrompt: string;
        tools: ToolDefinition$1[];
        memory?: MemoryStorage;
        maxHistoryMessages?: number;
        policyEnforcer?: PolicyEnforcer;
    });
    setSessionId(sessionId: string): void;
    /**
     * Chat with the agent
     */
    chat(userMessage: string, options?: ChatOptions): Promise<string>;
    /**
     * Execute a tool by name
     */
    executeTool(name: string, args: any): Promise<any>;
    /**
     * Stream chat response
     */
    chatStream(userMessage: string, options?: ChatOptions): AsyncGenerator<string>;
    /**
     * Clear conversation history
     */
    clearHistory(): Promise<void>;
    /**
     * Get conversation history
     */
    getHistory(): Promise<Message[]>;
    /**
     * Get LLM provider name
     */
    getLLMProvider(): string;
    /**
     * Get LLM model name
     */
    getModelName(): string;
    /**
     * Get available tools
     */
    getTools(): ToolDefinition$1[];
    /**
     * Get the active policy enforcer
     */
    getPolicyEnforcer(): PolicyEnforcer | undefined;
}
/**
 * Load an agent from sekuire.yml configuration
 *
 * @param agentName - Name of the agent to load (for multi-agent configs)
 * @param overrides - Optional overrides for agent configuration
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns Initialized agent instance
 *
 * @example
 * ```typescript
 * // Load agent from config
 * const agent = await getAgent('my-agent-openai');
 *
 * // Chat with the agent
 * const response = await agent.chat('Hello!');
 * console.log(response);
 * ```
 */
declare function getAgent(agentName?: string, overrides?: AgentOptions, configPath?: string): Promise<SekuireAgent>;
/**
 * Load all agents from configuration
 *
 * @param configPath - Path to sekuire.yml
 * @returns Map of agent name to agent instance
 *
 * @example
 * ```typescript
 * const agents = await getAgents();
 * const openai = agents.get('my-agent-openai');
 * const claude = agents.get('my-agent-claude');
 * ```
 */
declare function getAgents(configPath?: string): Promise<Map<string, SekuireAgent>>;
/**
 * Get system prompt for a specific agent from configuration
 *
 * @param agentName - Name of the agent (optional for single-agent configs)
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns The system prompt content
 *
 * @example
 * ```typescript
 * const prompt = await getSystemPrompt('my-agent-openai');
 * console.log(prompt);
 * ```
 */
declare function getSystemPrompt(agentName?: string, configPath?: string): Promise<string>;
/**
 * Get tools for a specific agent from configuration
 *
 * @param agentName - Name of the agent (optional for single-agent configs)
 * @param configPath - Path to sekuire.yml (defaults to './sekuire.yml')
 * @returns The tools schema with tool definitions
 *
 * @example
 * ```typescript
 * const toolsSchema = await getTools('my-agent-openai');
 * console.log(toolsSchema.tools);
 * ```
 */
declare function getTools(agentName?: string, configPath?: string): Promise<ToolDefinition$1[]>;

/**
 * Base class for implementing Sekuire protocol servers
 */
declare abstract class SekuireServer {
    protected readonly agentId: string;
    protected readonly keyPair: KeyPair;
    constructor(agentId: string, keyPair: KeyPair);
    /**
     * Handle the HELLO handshake message
     */
    handleHello(hello: HandshakeHello): Promise<HandshakeWelcome>;
    /**
     * Handle the AUTH handshake message
     */
    handleAuth(auth: HandshakeAuth, clientNonce: string): Promise<void>;
    /**
     * Get the agent's public key
     */
    getPublicKey(): string;
    /**
     * Get the agent's ID
     */
    getAgentId(): string;
    /**
     * Handle incoming webhooks from other agents
     */
    handleWebhook(payload: any, signature?: string): Promise<any>;
}
/**
 * Express.js middleware for Sekuire protocol
 */
declare function createSekuireExpressMiddleware(server: SekuireServer): any[];
/**
 * Fastify plugin for Sekuire protocol
 */
declare function createSekuireFastifyPlugin(server: SekuireServer): (fastify: any, options: any) => Promise<void>;

interface ToolInput {
    [key: string]: string | number | boolean | object;
}
interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object';
    description: string;
    required: boolean;
    default?: string | number | boolean | object;
}
interface ToolMetadata {
    name: string;
    description: string;
    parameters: ToolParameter[];
    category?: string;
    compliance_level?: 'public' | 'internal' | 'restricted' | 'system';
    requires_approval?: boolean;
}
declare abstract class Tool {
    abstract metadata: ToolMetadata;
    protected policyEnforcer?: PolicyEnforcer;
    abstract execute(input: ToolInput): Promise<string | object>;
    setPolicyEnforcer(enforcer: PolicyEnforcer): void;
    validate(input: ToolInput): boolean;
    toSchema(): object;
}
declare class ToolRegistry {
    private tools;
    private categories;
    register(tool: Tool): void;
    get(name: string): Tool | undefined;
    getTool(name: string): Tool | undefined;
    list(): Tool[];
    getAllTools(): Tool[];
    getSchemas(): object[];
    getToolsByCategory(category: string): string[];
    getAllCategories(): string[];
    hasCategory(category: string): boolean;
}

/**
 * Agent Discovery Tool - Find other agents by capability
 */
declare class AgentDiscoveryTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
/**
 * Agent Delegation Tool - Delegate tasks to other agents
 */
declare class AgentDelegationTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
/**
 * Agent Status Check Tool - Check if an agent is available
 */
declare class AgentStatusTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}

/**
 * Tool for invoking other Sekuire agents
 * Performs handshake and sends requests to verified agents
 */
declare class InvokeAgentTool extends Tool {
    metadata: ToolMetadata;
    private client;
    private readonly privateKey?;
    private readonly publicKey?;
    private readonly registryUrl;
    constructor(privateKey?: string, publicKey?: string, registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
}
/**
 * Tool for searching the Sekuire registry for agents
 */
declare class SearchAgentsTool extends Tool {
    metadata: ToolMetadata;
    private client;
    private readonly privateKey?;
    private readonly publicKey?;
    private readonly registryUrl;
    constructor(privateKey?: string, publicKey?: string, registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
}
/**
 * Tool for getting detailed information about a specific agent
 */
declare class GetAgentInfoTool extends Tool {
    metadata: ToolMetadata;
    private client;
    private readonly privateKey?;
    private readonly publicKey?;
    private readonly registryUrl;
    constructor(privateKey?: string, publicKey?: string, registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
}

declare class CalculatorTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}

declare class AuditLogTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        action: string;
        actor?: string;
        resource?: string;
        metadata?: any;
    }): Promise<{
        logged: boolean;
    }>;
}
declare class PiiDetectTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        text: string;
    }): Promise<{
        detected: boolean;
        types: string[];
        matches: any[];
    }>;
}
declare class EncryptDataTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        data: string;
        key?: string;
    }): Promise<{
        encrypted: string;
        iv: string;
    }>;
}
declare class DecryptDataTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        encrypted: string;
        iv: string;
        key: string;
    }): Promise<string>;
}

declare class JsonStringifyTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        data: any;
        pretty?: boolean;
    }): Promise<string>;
}
declare class CsvParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        csv: string;
        delimiter?: string;
        headers?: boolean;
    }): Promise<any[]>;
}
declare class CsvWriteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        data: any[];
        delimiter?: string;
        headers?: boolean;
    }): Promise<string>;
}
declare class YamlParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        yaml: string;
    }): Promise<any>;
}
declare class XmlParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        xml: string;
    }): Promise<any>;
}

declare class JsonParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class Base64EncodeTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class Base64DecodeTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class HashTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}

declare class DirectoryListTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class DirectoryMkdirTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class DirectoryRmdirTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class DirectoryRmRecursiveTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class DirectoryExistsTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class DirectoryMoveTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        source: string;
        destination: string;
    }): Promise<{
        moved: boolean;
    }>;
}
declare class DirectoryCopyTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        source: string;
        destination: string;
    }): Promise<{
        copied: boolean;
    }>;
}
declare class DirectoryTreeTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        path: string;
        depth?: number;
    }): Promise<any>;
}

declare class FileReadTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileWriteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileListTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileAppendTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileDeleteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileMoveTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileCopyTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileStatTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileExistsTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
declare class FileChmodTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        path: string;
        mode: string | number;
    }): Promise<{
        changed: boolean;
    }>;
}

declare class GoogleDocsCreateTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<{
        documentId: string;
        url: string;
    }>;
}

declare class HttpRequestTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string | object>;
}

declare class HttpPostTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        body?: any;
        headers?: Record<string, string>;
    }): Promise<any>;
}
declare class HttpPutTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        body?: any;
        headers?: Record<string, string>;
    }): Promise<any>;
}
declare class HttpDeleteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        headers?: Record<string, string>;
    }): Promise<any>;
}
declare class DownloadFileTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        destination: string;
    }): Promise<{
        path: string;
        size: number;
    }>;
}
declare class DnsLookupTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        hostname: string;
    }): Promise<{
        addresses: string[];
    }>;
}
declare class PingTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        host: string;
        count?: number;
    }): Promise<{
        alive: boolean;
        time?: number;
    }>;
}

declare class ToolPatternParser {
    /**
     * Get the tool name prefix for a category
     * "files" -> "file"
     * "directories" -> "dir"
     * "network" -> "http" or "network"
     */
    private static getCategoryPrefix;
    /**
     * Parse tool patterns:
     *   "calculator" => ["calculator"]
     *   "files:*" => ["file_read", "file_write", "file_delete", ...]
     *   "files:[read,write]" => ["file_read", "file_write"]
     */
    static parse(pattern: string, registry: ToolRegistry): string[];
    /**
     * Expand multiple patterns into unique tool names
     */
    static expandPatterns(patterns: string[], registry: ToolRegistry): string[];
    /**
     * Filter allowed tools by removing blocked ones
     */
    static filterBlocked(allowedTools: string[], blockedTools: string[]): string[];
}

declare class GetCwdTool extends Tool {
    metadata: ToolMetadata;
    execute(): Promise<string>;
}
declare class GetPlatformTool extends Tool {
    metadata: ToolMetadata;
    execute(): Promise<any>;
}
declare class EnvGetTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        key: string;
    }): Promise<string>;
}
declare class EnvSetTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        key: string;
        value: string;
    }): Promise<{
        set: boolean;
    }>;
}

declare class DateFormatTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        date?: string | number;
        format?: string;
    }): Promise<string>;
}
declare class GenerateUuidTool extends Tool {
    metadata: ToolMetadata;
    execute(): Promise<string>;
}
declare class RandomNumberTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        min?: number;
        max?: number;
    }): Promise<string>;
}
declare class SleepTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        milliseconds: number;
    }): Promise<{
        slept: number;
    }>;
}
declare class RegexMatchTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        text: string;
        pattern: string;
        flags?: string;
    }): Promise<{
        matches: string[];
        groups?: any[];
    }>;
}
declare class UrlParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
    }): Promise<any>;
}

/**
 * ⚠️ CRITICAL SYSTEM TOOL - DO NOT EDIT OR DELETE ⚠️
 *
 * This tool is automatically included by Sekuire to verify agent compliance
 * and verification status. Removing or modifying this tool will prevent your
 * agent from being properly verified and may result in trust protocol violations.
 *
 * This tool queries the Sekuire registry to check:
 * - Agent verification status (verified/unverified/pending)
 * - Compliance framework adherence
 * - Security score and reputation
 * - Code review status
 */

declare class VerificationStatusTool extends Tool {
    metadata: ToolMetadata;
    private registryUrl;
    constructor(registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
    /**
     * Get the current agent's Sekuire ID from environment or config
     */
    private getAgentId;
    /**
     * Extract compliance frameworks from manifest
     */
    private extractComplianceFrameworks;
    /**
     * Determine if agent is compliant based on verification status and checks
     */
    private isCompliant;
    /**
     * Calculate overall compliance score
     */
    private calculateComplianceScore;
    /**
     * Format the response for the agent
     */
    private formatResponse;
}

declare class WebSearchTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}

interface ToolRegistryOptions {
    privateKey?: string;
    publicKey?: string;
    registryUrl?: string;
}
declare function createDefaultToolRegistry(options?: ToolRegistryOptions): ToolRegistry;
declare const builtInTools: {
    FileReadTool: typeof FileReadTool;
    FileWriteTool: typeof FileWriteTool;
    FileAppendTool: typeof FileAppendTool;
    FileDeleteTool: typeof FileDeleteTool;
    FileMoveTool: typeof FileMoveTool;
    FileCopyTool: typeof FileCopyTool;
    FileStatTool: typeof FileStatTool;
    FileExistsTool: typeof FileExistsTool;
    FileListTool: typeof FileListTool;
    FileChmodTool: typeof FileChmodTool;
    DirectoryListTool: typeof DirectoryListTool;
    DirectoryMkdirTool: typeof DirectoryMkdirTool;
    DirectoryRmdirTool: typeof DirectoryRmdirTool;
    DirectoryRmRecursiveTool: typeof DirectoryRmRecursiveTool;
    DirectoryExistsTool: typeof DirectoryExistsTool;
    DirectoryMoveTool: typeof DirectoryMoveTool;
    DirectoryCopyTool: typeof DirectoryCopyTool;
    DirectoryTreeTool: typeof DirectoryTreeTool;
    WebSearchTool: typeof WebSearchTool;
    HttpRequestTool: typeof HttpRequestTool;
    HttpPostTool: typeof HttpPostTool;
    HttpPutTool: typeof HttpPutTool;
    HttpDeleteTool: typeof HttpDeleteTool;
    DownloadFileTool: typeof DownloadFileTool;
    DnsLookupTool: typeof DnsLookupTool;
    PingTool: typeof PingTool;
    GoogleDocsCreateTool: typeof GoogleDocsCreateTool;
    JsonParseTool: typeof JsonParseTool;
    JsonStringifyTool: typeof JsonStringifyTool;
    CsvParseTool: typeof CsvParseTool;
    CsvWriteTool: typeof CsvWriteTool;
    YamlParseTool: typeof YamlParseTool;
    XmlParseTool: typeof XmlParseTool;
    Base64EncodeTool: typeof Base64EncodeTool;
    Base64DecodeTool: typeof Base64DecodeTool;
    HashTool: typeof HashTool;
    CalculatorTool: typeof CalculatorTool;
    DateFormatTool: typeof DateFormatTool;
    GenerateUuidTool: typeof GenerateUuidTool;
    RandomNumberTool: typeof RandomNumberTool;
    SleepTool: typeof SleepTool;
    RegexMatchTool: typeof RegexMatchTool;
    UrlParseTool: typeof UrlParseTool;
    GetCwdTool: typeof GetCwdTool;
    GetPlatformTool: typeof GetPlatformTool;
    EnvGetTool: typeof EnvGetTool;
    EnvSetTool: typeof EnvSetTool;
    SearchAgentsTool: typeof SearchAgentsTool;
    GetAgentInfoTool: typeof GetAgentInfoTool;
    InvokeAgentTool: typeof InvokeAgentTool;
    AgentDiscoveryTool: typeof AgentDiscoveryTool;
    AgentDelegationTool: typeof AgentDelegationTool;
    AgentStatusTool: typeof AgentStatusTool;
    VerificationStatusTool: typeof VerificationStatusTool;
    AuditLogTool: typeof AuditLogTool;
    PiiDetectTool: typeof PiiDetectTool;
    EncryptDataTool: typeof EncryptDataTool;
    DecryptDataTool: typeof DecryptDataTool;
};

/**
 * Create a tool for discovering other agents in the Sekuire network
 */
declare function createDiscoveryTool(client: SekuireClient): ToolDefinition$2;
/**
 * Create a tool for delegating tasks to other agents
 */
declare function createDelegationTool(client: SekuireClient): ToolDefinition$2;

/**
 * Generate a new Ed25519 keypair for Sekuire operations
 */
declare function generateKeyPair(): KeyPair;
/**
 * Calculate Sekuire ID from agent configuration (canonical V2 algorithm).
 *
 * projectName and projectVersion are accepted for backwards compatibility
 * but are NOT used in the ID computation.
 */
declare function calculateSekuireId(params: {
    model: string;
    systemPrompt: string;
    tools: string;
    projectName?: string;
    projectVersion?: string;
}): string;
/**
 * @deprecated Use calculateSekuireId (V2) instead.
 */
declare function calculateSekuireIdLegacy(params: {
    model: string;
    systemPrompt: string;
    tools: string;
    projectName: string;
    projectVersion: string;
}): string;
/**
 * Create a SekuireClient with sensible defaults
 */
declare function createSekuireClient(keyPair: KeyPair, registryUrl?: string, options?: Partial<SekuireClientConfig>): SekuireClient;

interface SekuireExporterConfig {
    apiUrl: string;
    agentId: string;
    authToken?: string;
    workspaceId?: string;
}
declare class SekuireSpanExporter {
    private config;
    private pendingExport;
    constructor(config: SekuireExporterConfig);
    export(spans: any[], resultCallback: (result: any) => void): void;
    private spanToEvent;
    private mapSpanToEventType;
    private getDurationMs;
    private extractAttributes;
    private sendEvents;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
}

type ExporterType = 'otlp' | 'sekuire' | 'console' | 'none';
interface TelemetryConfig {
    enabled?: boolean;
    agentId: string;
    exporter?: ExporterType;
    otlpEndpoint?: string;
    sekuireApiUrl?: string;
    authToken?: string;
    workspaceId?: string;
    debug?: boolean;
    batchConfig?: {
        maxQueueSize?: number;
        maxExportBatchSize?: number;
        scheduledDelayMillis?: number;
    };
}
declare function initTelemetry(config: TelemetryConfig): any;
declare function getTracer(): any;
declare function shutdownTelemetry(): Promise<void>;

declare function detectDeploymentUrl(): string | undefined;

/**
 * A2A Protocol Client
 *
 * Client for interacting with A2A-compliant agents via the Sekuire API.
 */

interface A2AClientOptions {
    /** Base URL for the Sekuire API */
    baseUrl: string;
    /** Authentication token */
    authToken: string;
    /** Optional timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** Optional device fingerprint for API-key auth on task endpoints */
    deviceFingerprint?: string;
    /** Optional runtime token resolver for per-request credential sync */
    tokenResolver?: () => string | undefined;
    /** Optional callback to refresh credentials after runtime-token 401 */
    onUnauthorized?: () => Promise<void>;
}
/**
 * A2A Protocol Client
 *
 * @example
 * ```typescript
 * const client = new A2AClient({
 *   baseUrl: "https://api.sekuire.ai",
 *   authToken: "your-token",
 * });
 *
 * // Auto-discover and send task by skill
 * const result = await client.sendBySkill({
 *   skill: "document:summarize",
 *   message: {
 *     role: "user",
 *     parts: [{ type: "text", text: "Summarize this document" }],
 *   },
 * });
 *
 * // Stream task updates
 * for await (const event of client.subscribe(result.taskId)) {
 *   console.log(event.status, event.artifacts);
 * }
 * ```
 */
declare class A2AClient {
    private baseUrl;
    private authToken;
    private runtimeToken;
    private timeout;
    private deviceFingerprint;
    private tokenResolver?;
    private onUnauthorized?;
    constructor(options: A2AClientOptions);
    setRuntimeToken(token: string): void;
    /**
     * Send a task by skill using auto-discovery routing.
     * The API will find an agent with the matching skill and forward the task.
     */
    sendBySkill(request: A2ARouteRequest): Promise<A2ARouteResponse>;
    /**
     * Send a message directly to a specific agent.
     */
    send(agentUrl: string, message: A2AMessage, taskId?: string): Promise<A2ATask>;
    /**
     * Send a task via JSON-RPC to the Sekuire API.
     */
    sendTask(params: TasksSendParams): Promise<A2ATask>;
    /**
     * Get task status and details.
     */
    getTask(taskId: string): Promise<A2ATask>;
    /**
     * Cancel a running task.
     */
    cancelTask(taskId: string): Promise<A2ATask>;
    /**
     * Subscribe to task updates via SSE.
     *
     * @example
     * ```typescript
     * for await (const event of client.subscribe(taskId)) {
     *   console.log(event.status);
     *   if (event.status === "completed") break;
     * }
     * ```
     */
    subscribe(taskId: string): AsyncGenerator<TaskUpdateEvent>;
    /**
     * Register a task with sekuire-core (fire-and-forget safe).
     * Used by the delegator to record tasks when falling back to direct mode.
     */
    registerTask(params: {
        taskId?: string;
        targetCapability: string;
        targetAgentId?: string;
        requesterAgentId?: string;
        parentTaskId?: string;
        traceId?: string;
        input: unknown;
    }): Promise<{
        id: string;
    } | null>;
    /**
     * Mark a registered task as completed/failed (fire-and-forget safe).
     * Requires a runtime token (set via setRuntimeToken).
     */
    completeRegisteredTask(taskId: string, status: "completed" | "failed", output?: unknown, error?: unknown): Promise<boolean>;
    /**
     * Get an agent's card (capabilities, skills).
     */
    getAgentCard(agentId: string): Promise<AgentCard>;
    /**
     * Make a JSON-RPC call to the A2A endpoint.
     */
    private jsonRpc;
    private fetch;
    private fetchTask;
    private doFetchTask;
    private resolveRuntimeToken;
    private taskAuthHeaders;
    private isLikelyJwt;
}
/**
 * A2A Protocol Error
 */
declare class A2AError extends Error {
    readonly code: string;
    readonly jsonRpcCode?: number | undefined;
    constructor(message: string, code: string, jsonRpcCode?: number | undefined);
}

/**
 * A2A Protocol Server
 *
 * Server implementation for creating A2A-compliant agents with streaming support.
 */

interface A2AServerOptions {
    card: AgentCard;
    identity?: AgentIdentity;
    port?: number;
    handlers: Record<string, SkillHandler>;
    streamingHandlers?: Record<string, StreamingSkillHandler>;
}
type SkillHandler = (message: A2AMessage, context: SkillContext) => Promise<A2AMessage | A2AArtifact[]>;
type StreamingSkillHandler = (message: A2AMessage, context: StreamingSkillContext) => AsyncGenerator<StreamingUpdate>;
interface SkillContext {
    taskId: string;
    contextId?: string;
    history: A2AMessage[];
}
interface StreamingSkillContext extends SkillContext {
    emit: (update: StreamingUpdate) => void;
}
type StreamingUpdate = {
    type: "progress";
    message: string;
    percent?: number;
} | {
    type: "artifact";
    artifact: A2AArtifact;
} | {
    type: "message";
    message: A2AMessage;
} | {
    type: "status";
    status: A2ATaskState;
};
interface TaskState {
    id: string;
    contextId?: string;
    status: A2ATaskState;
    history: A2AMessage[];
    artifacts: A2AArtifact[];
    createdAt: Date;
    updatedAt: Date;
    subscribers: Set<(event: TaskUpdateEvent) => void>;
}
declare class A2AServer {
    private card;
    private identity?;
    private handlers;
    private streamingHandlers;
    private tasks;
    private heartbeatInterval?;
    constructor(options: A2AServerOptions);
    /**
     * Start sending heartbeats to the registry
     * @param publicUrl The public URL where this agent is reachable
     * @param registryUrl The registry API base URL (default: http://localhost:3000)
     */
    startHeartbeat(publicUrl: string, registryUrl?: string): Promise<void>;
    stopHeartbeat(): void;
    getAgentCard(): AgentCard;
    getTask(taskId: string): TaskState | undefined;
    handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;
    handleStreamingRequest(request: JsonRpcRequest): AsyncGenerator<TaskUpdateEvent>;
    subscribeToTask(taskId: string): AsyncGenerator<TaskUpdateEvent> | null;
    formatSSE(event: TaskUpdateEvent): string;
    notifySubscribers(taskId: string): void;
    private handleTasksSend;
    private handleTasksGet;
    private handleTasksCancel;
    private findHandler;
    private findStreamingHandler;
    private findHandlerInMap;
    private extractText;
    private createUpdateEvent;
    private taskToResponse;
    private success;
    private error;
    private generateId;
}

export { A2AClient, A2AError, A2AServer, A2ATaskDelegator, SekuireAgent as Agent, AgentIdentity, AnthropicProvider, BaseMemoryStorage, Beacon, CONVEX_FUNCTIONS_TEMPLATE, CONVEX_SCHEMA_TEMPLATE, CloudflareD1Storage, CloudflareKVStorage, ComplianceError, ComplianceMonitor, ContentPolicyError, ConvexStorage, CryptoError, DEFAULT_API_URL, DynamoDBStorage, FileAccessError, GoogleProvider, InMemoryStorage, NetworkComplianceError, NetworkError, OllamaProvider, OpenAIProvider, PolicyClient, PolicyEnforcer, PolicyGateway, PolicyViolationError, PostgresStorage, ProtocolError, RedisStorage, RuntimeCredentialsStore, SQLiteStorage, SekuireAgent$1 as SekuireAgent, SekuireAgentBuilder, SekuireClient, SekuireCrypto, SekuireError, SekuireLogger, SekuireRegistryClient, SekuireSDK, SekuireServer, SekuireSpanExporter, TaskWorker, Tool, ToolPatternParser, ToolRegistry, ToolUsageError, TursoStorage, UpstashStorage, applyBootstrapResponse, builtInTools, calculateSekuireId, calculateSekuireIdLegacy, createAgent, createBeacon, createDefaultToolRegistry, createDelegationTool, createDelegator, createDiscoveryTool, createLLMProvider, createMemoryStorage, createRegistryClient, createSekuireClient, createSekuireExpressMiddleware, createSekuireFastifyPlugin, createWorker, detectDeploymentUrl, generateKeyPair, getAgent, getAgentConfig, getAgents, getTools$1 as getLegacyTools, getStorageInfo, getSystemPrompt, getTools, getTracer, hasStorage, initTelemetry, listStorageTypes, llm, loadConfig, loadSystemPrompt, loadTools, registerStorage, shutdownTelemetry, tool, tools };
export type { A2AArtifact, A2AClientOptions, A2AMessage, A2AMessagePart, A2ARouteRequest, A2ARouteResponse, A2AServerOptions, A2ATask, A2ATaskState, A2ATaskStatus, ActivePolicy, ActivePolicyResponse, AgentCapabilities, AgentCard, AgentConfig, AgentId, AgentInvokeOptions, AgentOptions, AgentProvider, AgentResponse$1 as AgentResponse, AgentSkill, BeaconConfig, BeaconStatus, BootstrapResponse, BootstrapResponseData, BootstrapTarget, BuiltInMemoryType, ChatChunk, ChatOptions, ChatResponse, CloudflareD1Config, CloudflareKVConfig, ComplianceConfig, ComplianceViolation, ConditionOperator, ToolDefinition$1 as ConfigToolDefinition, ConvexConfig, CreateOrgRequest, CreateWorkspaceRequest, CustomRule, DelegationRequest, DelegationResult, DelegatorConfig, DisputeRequest, DisputeResponse, DynamoDBConfig, EventLog, EventType, ExporterType, FallbackMode, HandshakeAuth, HandshakeHello, HandshakeResult, HandshakeWelcome, HexString, IdentityConfig, InstallationCredentials, InviteRequest, InviteResponse, JsonRpcError, JsonRpcRequest, JsonRpcResponse, KeyPair, LLMConfig, Message as LLMMessage, LLMProvider, LLMProviderConfig, ToolCallFunction as LLMToolCall, ToolDefinition as LLMToolDefinition, LeaderboardEntry, LoggerConfig$1 as LoggerConfig, Manifest, MemoryConfig, MemoryFactoryConfig, MemoryMessage, MemoryStorage, MemoryType, Message$1 as Message, OrgResponse, OrgSummary, PerAgentLimits, PolicyDecision, PolicyViolation, PostgresConfig, ProjectMetadata, PublishAgentOptions, PublishRequest, PublishResponse, RateLimitsConfig$1 as RateLimitsConfig, RedisConfig, RegistryClientConfig, ReputationLog, ReputationResponse, RuleCondition, RuntimeCredentials, SQLiteConfig, SearchAgentsOptions, SekuireAgentConfig, SekuireClientConfig, SekuireConfig, SekuireExporterConfig, SekuireSDKConfig, Severity, SkillContext, SkillHandler, StreamingSkillContext, StreamingSkillHandler, StreamingUpdate, SubmitReputationRequest, TaskCompletion, TaskContext, TaskEvent, TaskHandler, TaskState, TaskUpdateEvent, TasksCancelParams, TasksGetParams, TasksSendParams, TasksSendSubscribeParams, TelemetryConfig, ToolCall, ToolDefinition$2 as ToolDefinition, ToolInput, ToolMetadata, ToolParameter, ToolsSchema, TrustHeaders, TrustHeadersRequest, TursoConfig, UpdateAgentOptions, UpstashConfig, UserContextResponse, VerificationIssue, VerificationRequest, VerificationResult, VerificationStatus, VerifyAgentRequest, WorkerConfig, WorkspaceResponse, WorkspaceSummary };
