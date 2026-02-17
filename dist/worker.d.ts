/**
 * Sekuire Task Worker
 *
 * Handles SSE connection to Core for real-time task delivery.
 * Provides `onTask()` API for agents to register task handlers.
 */
import type { PolicyGateway } from "./policy-gateway";
import { RuntimeCredentialsStore } from "./runtime-credentials";
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
export type TaskHandler = (ctx: TaskContext, input: Record<string, unknown>) => Promise<unknown>;
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
export declare class TaskWorker {
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
export declare function createWorker(config: WorkerConfig): TaskWorker;
