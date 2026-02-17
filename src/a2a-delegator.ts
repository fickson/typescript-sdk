/**
 * A2A Task Delegator
 *
 * Enables agents to delegate tasks to other agents and receive completion callbacks.
 * Provides a complete feedback loop for multi-agent orchestration.
 */

import { A2AClient, A2AError } from "./a2a-client";
import type { PolicyGateway } from "./policy-gateway";
import { PolicyViolationError } from "./types";
import type {
  A2AMessage,
  A2ARouteResponse,
  A2ATask,
  A2ATaskState,
  JsonRpcRequest,
  JsonRpcResponse,
  TaskUpdateEvent,
} from "./types/a2a-types";

export interface DelegatorConfig {
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

export interface DelegationRequest {
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

export interface DelegationResult {
  taskId: string;
  agentId: string;
  traceId?: string;
  status: A2ATaskState;
  result?: A2AMessage;
  artifacts?: Array<{ name?: string; parts: Array<{ type: string; text?: string }> }>;
  error?: string;
  executionTimeMs: number;
}

export class A2ATaskDelegator {
  private client: A2AClient;
  private config: DelegatorConfig;
  private activeDelegations: Map<string, AbortController> = new Map();
  private policyGateway?: PolicyGateway;

  constructor(config: DelegatorConfig) {
    this.config = {
      timeout: 60000,
      pollInterval: 1000,
      maxRetries: 0,
      retryDelayMs: 1000,
      retryBackoffMultiplier: 2,
      ...config,
    };

    this.policyGateway = config.policyGateway;

    this.client = new A2AClient({
      baseUrl: config.apiUrl,
      authToken: config.authToken,
      timeout: this.config.timeout,
      tokenResolver: config.tokenResolver,
      onUnauthorized: config.onUnauthorized,
    });
  }

  setRuntimeToken(token: string): void {
    this.client.setRuntimeToken(token);
  }

  async delegate(request: DelegationRequest): Promise<DelegationResult> {
    const maxRetries = this.config.maxRetries!;
    if (maxRetries <= 0) {
      return this.delegateOnce(request);
    }

    let lastResult: DelegationResult | undefined;
    let delay = this.config.retryDelayMs!;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      lastResult = await this.delegateOnce(request);

      if (lastResult.status !== "failed" || !this.isRetryableError(lastResult.error)) {
        return lastResult;
      }

      if (attempt < maxRetries) {
        if (request.onProgress) {
          request.onProgress({
            taskId: lastResult.taskId || "",
            status: "working",
            updatedAt: new Date().toISOString(),
            message: {
              role: "agent",
              parts: [{ type: "text", text: `Retry attempt ${attempt + 1}/${maxRetries} after error: ${lastResult.error}` }],
            },
          });
        }
        await this.sleep(delay);
        delay = Math.min(delay * this.config.retryBackoffMultiplier!, 30000);
      }
    }

    return lastResult!;
  }

  private isRetryableError(error?: string): boolean {
    if (!error) return false;
    const retryablePatterns = [
      "fetch failed",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "ECONNRESET",
      "network",
      "socket hang up",
      "503",
      "502",
      "500",
      "429",
      "rate limit",
      "timeout",
    ];
    const lower = error.toLowerCase();
    return retryablePatterns.some((p) => lower.includes(p.toLowerCase()));
  }

  private async delegateOnce(request: DelegationRequest): Promise<DelegationResult> {
    const startTime = Date.now();

    if (this.policyGateway) {
      const rateLimitDecision = this.policyGateway.checkRateLimit("request");
      if (!rateLimitDecision.allowed) {
        return {
          taskId: "",
          agentId: "",
          status: "failed",
          error: rateLimitDecision.violations[0]?.message || "Rate limit exceeded",
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    const message: A2AMessage =
      typeof request.message === "string"
        ? {
            role: "user",
            parts: [{ type: "text", text: request.message }],
          }
        : request.message;

    let routeResponse: A2ARouteResponse;
    try {
      routeResponse = await this.client.sendBySkill({
        skill: request.skill,
        message,
        contextId: request.contextId,
        parentTaskId: request.parentTaskId,
        traceId: request.traceId,
      });
    } catch (err) {
      if (err instanceof A2AError && err.code === "policy_violation") {
        throw new PolicyViolationError(
          err.message || "Task denied by workspace policy",
          "workspace_policy",
        );
      }

      if (request.targetUrl) {
        return this.delegateDirect(request, message, startTime);
      }
      const errorMessage = err instanceof A2AError ? err.message : String(err);
      return {
        taskId: "",
        agentId: "",
        status: "failed",
        error: `Delegation failed: ${errorMessage}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const { taskId, agentId, traceId } = routeResponse;
    const abortController = new AbortController();
    this.activeDelegations.set(taskId, abortController);

    try {
      const result = await this.waitForCompletion(
        taskId,
        request.timeout || this.config.timeout!,
        request.onProgress,
        abortController.signal
      );

      return {
        taskId,
        agentId,
        traceId,
        status: result.status.state,
        result: result.history[result.history.length - 1],
        artifacts: result.artifacts,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        taskId,
        agentId,
        traceId,
        status: "failed",
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      this.activeDelegations.delete(taskId);
    }
  }

  async *delegateWithStreaming(
    request: DelegationRequest
  ): AsyncGenerator<TaskUpdateEvent, DelegationResult> {
    const startTime = Date.now();

    const message: A2AMessage =
      typeof request.message === "string"
        ? {
            role: "user",
            parts: [{ type: "text", text: request.message }],
          }
        : request.message;

    let routeResponse: A2ARouteResponse;
    try {
      routeResponse = await this.client.sendBySkill({
        skill: request.skill,
        message,
        contextId: request.contextId,
        parentTaskId: request.parentTaskId,
        traceId: request.traceId,
      });
    } catch (err) {
      if (err instanceof A2AError && err.code === "policy_violation") {
        throw new PolicyViolationError(
          err.message || "Task denied by workspace policy",
          "workspace_policy",
        );
      }
      const errorMessage = err instanceof A2AError ? err.message : String(err);
      return {
        taskId: "",
        agentId: "",
        status: "failed",
        error: `Delegation failed: ${errorMessage}`,
        executionTimeMs: Date.now() - startTime,
      };
    }

    const { taskId, agentId, traceId } = routeResponse;

    yield {
      taskId,
      status: "working",
      updatedAt: new Date().toISOString(),
      message: {
        role: "agent",
        parts: [{ type: "text", text: `Delegated to agent ${agentId}` }],
      },
    };

    let finalTask: A2ATask | undefined;

    try {
      for await (const event of this.client.subscribe(taskId)) {
        yield event;

        if (["completed", "failed", "canceled"].includes(event.status)) {
          finalTask = await this.client.getTask(taskId);
          break;
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        taskId,
        agentId,
        traceId,
        status: "failed",
        error: errorMessage,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (!finalTask) {
      finalTask = await this.client.getTask(taskId);
    }

    return {
      taskId,
      agentId,
      traceId,
      status: finalTask.status.state,
      result: finalTask.history[finalTask.history.length - 1],
      artifacts: finalTask.artifacts,
      executionTimeMs: Date.now() - startTime,
    };
  }

  private async delegateDirect(
    request: DelegationRequest,
    message: A2AMessage,
    startTime: number,
  ): Promise<DelegationResult> {
    const targetUrl = request.targetUrl!;
    const agentId = request.targetAgentId || "unknown";

    const registered = await this.client.registerTask({
      targetCapability: request.skill,
      targetAgentId: request.targetAgentId,
      parentTaskId: request.parentTaskId,
      traceId: request.traceId,
      input: { skill: request.skill, message },
    });
    const registeredTaskId = registered?.id;

    try {
      const taskId = `a2a_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const jsonRpcRequest: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "tasks/send",
        id: taskId,
        params: { taskId, message },
      };

      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jsonRpcRequest),
        signal: AbortSignal.timeout(request.timeout || this.config.timeout!),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        if (registeredTaskId) {
          await this.completeRegisteredTaskAndWarn(
            registeredTaskId,
            "failed",
            undefined,
            { message: errText },
          );
        }
        return {
          taskId: registeredTaskId || taskId,
          agentId,
          status: "failed",
          error: `Direct call failed: ${response.status} ${errText}`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const result = (await response.json()) as JsonRpcResponse<A2ATask>;

      if (result.error) {
        if (registeredTaskId) {
          await this.completeRegisteredTaskAndWarn(
            registeredTaskId,
            "failed",
            undefined,
            result.error,
          );
        }
        return {
          taskId: registeredTaskId || taskId,
          agentId,
          status: "failed",
          error: result.error.message,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const task = result.result!;
      const finalStatus = task.status.state;
      const lastMessage = task.history?.[task.history.length - 1];

      if (registeredTaskId) {
        const completionStatus = finalStatus === "completed" ? "completed" : "failed";
        await this.completeRegisteredTaskAndWarn(
          registeredTaskId,
          completionStatus,
          finalStatus === "completed" ? { result: lastMessage } : undefined,
          finalStatus !== "completed" ? { message: "Task did not complete" } : undefined,
        );
      }

      return {
        taskId: registeredTaskId || task.taskId,
        agentId,
        status: finalStatus,
        result: lastMessage,
        artifacts: task.artifacts,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (registeredTaskId) {
        await this.completeRegisteredTaskAndWarn(
          registeredTaskId,
          "failed",
          undefined,
          { message: errorMessage },
        );
      }
      return {
        taskId: registeredTaskId || "",
        agentId,
        status: "failed",
        error: `Direct delegation failed: ${errorMessage}`,
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  private async completeRegisteredTaskAndWarn(
    taskId: string,
    status: "completed" | "failed",
    output?: unknown,
    error?: unknown,
  ): Promise<void> {
    const updated = await this.client.completeRegisteredTask(
      taskId,
      status,
      output,
      error,
    );
    if (!updated) {
      console.warn(
        `[A2ATaskDelegator] Failed to mark task ${taskId} as ${status}`,
      );
    }
  }

  cancelDelegation(taskId: string): void {
    const controller = this.activeDelegations.get(taskId);
    if (controller) {
      controller.abort();
      this.activeDelegations.delete(taskId);
    }

    this.client.cancelTask(taskId).catch(() => {});
  }

  cancelAllDelegations(): void {
    for (const [taskId, controller] of this.activeDelegations) {
      controller.abort();
      this.client.cancelTask(taskId).catch(() => {});
    }
    this.activeDelegations.clear();
  }

  async discoverAgents(skill: string): Promise<Array<{ agentId: string; name: string }>> {
    try {
      const card = await this.client.getAgentCard(skill);
      return [{ agentId: card.agentId, name: card.name }];
    } catch {
      return [];
    }
  }

  private async waitForCompletion(
    taskId: string,
    timeout: number,
    onProgress?: (event: TaskUpdateEvent) => void,
    signal?: AbortSignal
  ): Promise<A2ATask> {
    const deadline = Date.now() + timeout;

    try {
      for await (const event of this.client.subscribe(taskId)) {
        if (signal?.aborted) {
          throw new Error("Delegation cancelled");
        }

        if (onProgress) {
          onProgress(event);
        }

        if (["completed", "failed", "canceled"].includes(event.status)) {
          return this.client.getTask(taskId);
        }

        if (Date.now() > deadline) {
          throw new Error("Delegation timeout");
        }
      }
    } catch (err) {
      if (err instanceof Error && err.message === "Delegation cancelled") {
        throw err;
      }

      return this.pollForCompletion(taskId, deadline, onProgress, signal);
    }

    return this.client.getTask(taskId);
  }

  private async pollForCompletion(
    taskId: string,
    deadline: number,
    onProgress?: (event: TaskUpdateEvent) => void,
    signal?: AbortSignal
  ): Promise<A2ATask> {
    while (Date.now() < deadline) {
      if (signal?.aborted) {
        throw new Error("Delegation cancelled");
      }

      const task = await this.client.getTask(taskId);

      if (onProgress) {
        onProgress({
          taskId,
          status: task.status.state,
          updatedAt: task.status.timestamp,
          message: task.history[task.history.length - 1],
          artifacts: task.artifacts,
        });
      }

      if (["completed", "failed", "canceled"].includes(task.status.state)) {
        return task;
      }

      await this.sleep(this.config.pollInterval!);
    }

    throw new Error("Delegation timeout");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createDelegator(config: DelegatorConfig): A2ATaskDelegator {
  return new A2ATaskDelegator(config);
}
