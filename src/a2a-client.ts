/**
 * A2A Protocol Client
 *
 * Client for interacting with A2A-compliant agents via the Sekuire API.
 */

import type {
  A2AMessage,
  A2ARouteRequest,
  A2ARouteResponse,
  A2ATask,
  AgentCard,
  JsonRpcRequest,
  JsonRpcResponse,
  TasksCancelParams,
  TasksGetParams,
  TasksSendParams,
  TaskUpdateEvent,
} from "./types/a2a-types";

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
export class A2AClient {
  private baseUrl: string;
  private authToken: string;
  private runtimeToken: string | undefined;
  private timeout: number;
  private deviceFingerprint: string;
  private tokenResolver?: () => string | undefined;
  private onUnauthorized?: () => Promise<void>;

  constructor(options: A2AClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.authToken = options.authToken;
    this.timeout = options.timeout ?? 30000;
    this.deviceFingerprint =
      options.deviceFingerprint ||
      process.env.SEKUIRE_DEVICE_FINGERPRINT ||
      "sekuire-typescript-sdk";
    this.tokenResolver = options.tokenResolver;
    this.onUnauthorized = options.onUnauthorized;
  }

  setRuntimeToken(token: string): void {
    this.runtimeToken = token;
  }

  /**
   * Send a task by skill using auto-discovery routing.
   * The API will find an agent with the matching skill and forward the task.
   */
  async sendBySkill(request: A2ARouteRequest): Promise<A2ARouteResponse> {
    const response = await this.fetchTask("/a2a/route", {
      method: "POST",
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error: { message?: string; error?: string } = await response.json().catch((): { message?: string; error?: string } => ({}));
      throw new A2AError(
        error.message || `Request failed: ${response.status}`,
        error.error || "request_failed"
      );
    }

    return response.json();
  }

  /**
   * Send a message directly to a specific agent.
   */
  async send(
    agentUrl: string,
    message: A2AMessage,
    taskId?: string
  ): Promise<A2ATask> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "tasks/send",
      id: Date.now().toString(),
      params: {
        taskId,
        message,
      } satisfies TasksSendParams,
    };

    const response = await fetch(agentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new A2AError(`Agent request failed: ${response.status}`, "agent_error");
    }

    const result: JsonRpcResponse<A2ATask> = await response.json();

    if (result.error) {
      throw new A2AError(result.error.message, "jsonrpc_error", result.error.code);
    }

    return result.result!;
  }

  /**
   * Send a task via JSON-RPC to the Sekuire API.
   */
  async sendTask(params: TasksSendParams): Promise<A2ATask> {
    return this.jsonRpc<A2ATask>("tasks/send", params);
  }

  /**
   * Get task status and details.
   */
  async getTask(taskId: string): Promise<A2ATask> {
    return this.jsonRpc<A2ATask>("tasks/get", { taskId } satisfies TasksGetParams);
  }

  /**
   * Cancel a running task.
   */
  async cancelTask(taskId: string): Promise<A2ATask> {
    return this.jsonRpc<A2ATask>("tasks/cancel", {
      taskId,
    } satisfies TasksCancelParams);
  }

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
  async *subscribe(taskId: string): AsyncGenerator<TaskUpdateEvent> {
    const url = `${this.baseUrl}/a2a/subscribe/${taskId}`;

    const response = await fetch(url, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${this.authToken}`,
      },
    });

    if (!response.ok) {
      throw new A2AError(`SSE connection failed: ${response.status}`, "sse_error");
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new A2AError("No response body", "sse_error");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            const data = line.slice(5).trim();
            if (data) {
              try {
                const event = JSON.parse(data) as TaskUpdateEvent;
                yield event;

                // Stop on terminal states
                if (
                  ["completed", "failed", "canceled"].includes(event.status)
                ) {
                  return;
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Register a task with sekuire-core (fire-and-forget safe).
   * Used by the delegator to record tasks when falling back to direct mode.
   */
  async registerTask(params: {
    taskId?: string;
    targetCapability: string;
    targetAgentId?: string;
    requesterAgentId?: string;
    parentTaskId?: string;
    traceId?: string;
    input: unknown;
  }): Promise<{ id: string } | null> {
    try {
      const response = await this.fetchTask("/api/v1/tasks", {
        method: "POST",
        body: JSON.stringify({
          target_capability: params.targetCapability,
          target_agent_id: params.targetAgentId,
          input: params.input,
          parent_task_id: params.parentTaskId,
          trace_id: params.traceId,
        }),
      });

      if (!response.ok) {
        console.warn(
          `[A2AClient] registerTask failed with status ${response.status}`
        );
        return null;
      }
      return response.json();
    } catch {
      console.warn("[A2AClient] registerTask request failed");
      return null;
    }
  }

  /**
   * Mark a registered task as completed/failed (fire-and-forget safe).
   * Requires a runtime token (set via setRuntimeToken).
   */
  async completeRegisteredTask(
    taskId: string,
    status: "completed" | "failed",
    output?: unknown,
    error?: unknown,
  ): Promise<boolean> {
    try {
      const response = await this.fetchTask(`/api/v1/tasks/${taskId}/complete`, {
        method: "POST",
        body: JSON.stringify({ status, output, error }),
      });
      if (!response.ok) {
        console.warn(
          `[A2AClient] completeRegisteredTask failed with status ${response.status}`
        );
      }
      return response.ok;
    } catch {
      console.warn("[A2AClient] completeRegisteredTask request failed");
      return false;
    }
  }

  /**
   * Get an agent's card (capabilities, skills).
   */
  async getAgentCard(agentId: string): Promise<AgentCard> {
    const response = await this.fetch(
      `/a2a/${agentId}/.well-known/agent.json`,
      { method: "GET" }
    );

    if (!response.ok) {
      throw new A2AError(`Failed to get agent card: ${response.status}`, "not_found");
    }

    return response.json();
  }

  /**
   * Make a JSON-RPC call to the A2A endpoint.
   */
  private async jsonRpc<T>(method: string, params: unknown): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      id: Date.now().toString(),
      params,
    };

    const response = await this.fetch("/a2a", {
      method: "POST",
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new A2AError(`Request failed: ${response.status}`, "request_failed");
    }

    const result: JsonRpcResponse<T> = await response.json();

    if (result.error) {
      throw new A2AError(result.error.message, "jsonrpc_error", result.error.code);
    }

    return result.result!;
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
  }

  private async fetchTask(path: string, init: RequestInit): Promise<Response> {
    const runtimeToken = this.resolveRuntimeToken();
    const response = await this.doFetchTask(path, init, runtimeToken);
    const usedRuntimeToken = !!runtimeToken && runtimeToken.startsWith("srt_");

    if (response.status === 401 && usedRuntimeToken && this.onUnauthorized) {
      try {
        await this.onUnauthorized();
      } catch {
        return response;
      }
      return this.doFetchTask(path, init, this.resolveRuntimeToken());
    }

    return response;
  }

  private async doFetchTask(
    path: string,
    init: RequestInit,
    runtimeToken?: string
  ): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...this.taskAuthHeaders(runtimeToken),
        ...init.headers,
      },
      signal: AbortSignal.timeout(this.timeout),
    });
  }

  private resolveRuntimeToken(): string | undefined {
    return this.tokenResolver?.() ?? this.runtimeToken;
  }

  private taskAuthHeaders(runtimeToken?: string): HeadersInit {
    if (runtimeToken) {
      return { Authorization: `Bearer ${runtimeToken}` };
    }

    if (this.isLikelyJwt(this.authToken)) {
      return { Authorization: `Bearer ${this.authToken}` };
    }

    if (this.authToken) {
      return {
        "X-API-Key": this.authToken,
        "X-Device-Fingerprint": this.deviceFingerprint,
      };
    }

    return {};
  }

  private isLikelyJwt(token: string): boolean {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return false;
    }
    return parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part));
  }
}

/**
 * A2A Protocol Error
 */
export class A2AError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly jsonRpcCode?: number
  ) {
    super(message);
    this.name = "A2AError";
  }
}
