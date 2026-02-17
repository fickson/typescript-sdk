/**
 * A2A Protocol Client
 *
 * Client for interacting with A2A-compliant agents via the Sekuire API.
 */
import type { A2AMessage, A2ARouteRequest, A2ARouteResponse, A2ATask, AgentCard, TasksSendParams, TaskUpdateEvent } from "./types/a2a-types";
export interface A2AClientOptions {
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
export declare class A2AClient {
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
export declare class A2AError extends Error {
    readonly code: string;
    readonly jsonRpcCode?: number | undefined;
    constructor(message: string, code: string, jsonRpcCode?: number | undefined);
}
