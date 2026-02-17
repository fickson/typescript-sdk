/**
 * A2A Protocol Server
 *
 * Server implementation for creating A2A-compliant agents with streaming support.
 */

import type {
    A2AArtifact,
    A2AMessage,
    A2ATask, A2ATaskState, AgentCard,
    AgentSkill,
    JsonRpcRequest,
    JsonRpcResponse,
    TasksCancelParams,
    TasksGetParams,
    TasksSendParams,
    TasksSendSubscribeParams,
    TaskUpdateEvent
} from "./types/a2a-types";

import { AgentIdentity } from "./identity";

export interface A2AServerOptions {
  card: AgentCard;
  identity?: AgentIdentity; // for signing
  port?: number;
  handlers: Record<string, SkillHandler>;
  streamingHandlers?: Record<string, StreamingSkillHandler>;
}

export type SkillHandler = (
  message: A2AMessage,
  context: SkillContext
) => Promise<A2AMessage | A2AArtifact[]>;

export type StreamingSkillHandler = (
  message: A2AMessage,
  context: StreamingSkillContext
) => AsyncGenerator<StreamingUpdate>;

export interface SkillContext {
  taskId: string;
  contextId?: string;
  history: A2AMessage[];
}

export interface StreamingSkillContext extends SkillContext {
  emit: (update: StreamingUpdate) => void;
}

export type StreamingUpdate =
  | { type: "progress"; message: string; percent?: number }
  | { type: "artifact"; artifact: A2AArtifact }
  | { type: "message"; message: A2AMessage }
  | { type: "status"; status: A2ATaskState };

export interface TaskState {
  id: string;
  contextId?: string;
  status: A2ATaskState;
  history: A2AMessage[];
  artifacts: A2AArtifact[];
  createdAt: Date;
  updatedAt: Date;
  subscribers: Set<(event: TaskUpdateEvent) => void>;
}

export class A2AServer {
  private card: AgentCard;
  private identity?: AgentIdentity;
  private handlers: Record<string, SkillHandler>;
  private streamingHandlers: Record<string, StreamingSkillHandler>;
  private tasks: Map<string, TaskState> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(options: A2AServerOptions) {
    this.card = options.card;
    this.identity = options.identity;
    this.handlers = options.handlers;
    this.streamingHandlers = options.streamingHandlers || {};
  }

  /**
   * Start sending heartbeats to the registry
   * @param publicUrl The public URL where this agent is reachable
   * @param registryUrl The registry API base URL (default: http://localhost:3000)
   */
  async startHeartbeat(publicUrl: string, registryUrl = "http://localhost:3000") {
    if (!this.identity) {
      console.warn("Cannot start heartbeat: No AgentIdentity provided");
      return;
    }

    const sendHeartbeat = async () => {
      try {
        const timestamp = new Date().toISOString();
        const payload = {
          sekuire_id: this.identity!.sekuireId,
          endpoint: {
            url: publicUrl,
            protocol: "http",
          },
          status: "online",
          timestamp,
        };

        // Create signature: sekuire_id + url + timestamp
        const message = `${payload.sekuire_id}${publicUrl}${timestamp}`;
        // Note: AgentIdentity.sign needs to support byte arrays or string input for real Ed25519
        // Currently it mocks it.
        const signature = await this.identity!.sign(message); 

        await fetch(`${registryUrl}/api/v1/agents/heartbeat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            signature,
          }),
        });
      } catch (err) {
        console.error("Heartbeat failed:", err);
      }
    };

    // Send immediately
    void sendHeartbeat();
    // Then every 60s
    this.heartbeatInterval = setInterval(sendHeartbeat, 60000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  getAgentCard(): AgentCard {
    return this.card;
  }

  getTask(taskId: string): TaskState | undefined {
    return this.tasks.get(taskId);
  }

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (request.jsonrpc !== "2.0") {
      return this.error(request.id, -32600, "Invalid JSON-RPC version");
    }

    try {
      switch (request.method) {
        case "tasks/send":
          return this.handleTasksSend(request);
        case "tasks/get":
          return this.handleTasksGet(request);
        case "tasks/cancel":
          return this.handleTasksCancel(request);
        case "tasks/sendSubscribe":
          return this.error(
            request.id,
            -32601,
            "Use handleStreamingRequest for tasks/sendSubscribe"
          );
        default:
          return this.error(request.id, -32601, `Method not found: ${request.method}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return this.error(request.id, -32603, message);
    }
  }

  async *handleStreamingRequest(
    request: JsonRpcRequest
  ): AsyncGenerator<TaskUpdateEvent> {
    if (request.method !== "tasks/sendSubscribe") {
      throw new Error("Only tasks/sendSubscribe supports streaming");
    }

    const params = request.params as TasksSendSubscribeParams;
    if (!params?.message) {
      throw new Error("Missing message parameter");
    }

    const taskId = params.taskId || this.generateId();
    let task = this.tasks.get(taskId);

    if (!task) {
      task = {
        id: taskId,
        contextId: undefined,
        status: "submitted",
        history: [],
        artifacts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        subscribers: new Set(),
      };
      this.tasks.set(taskId, task);
    }

    task.history.push(params.message);
    task.status = "working";
    task.updatedAt = new Date();

    yield this.createUpdateEvent(task);

    const streamingHandler = this.findStreamingHandler(params.message);
    const regularHandler = this.findHandler(params.message);

    if (streamingHandler) {
      const context: StreamingSkillContext = {
        taskId,
        history: task.history,
        emit: () => {},
      };

      try {
        for await (const update of streamingHandler(params.message, context)) {
          task.updatedAt = new Date();

          switch (update.type) {
            case "progress":
              yield {
                taskId,
                status: "working",
                updatedAt: task.updatedAt.toISOString(),
                message: {
                  role: "agent",
                  parts: [{ type: "text", text: update.message }],
                },
              };
              break;

            case "artifact":
              task.artifacts.push(update.artifact);
              yield {
                taskId,
                status: "working",
                updatedAt: task.updatedAt.toISOString(),
                artifacts: [update.artifact],
              };
              break;

            case "message":
              task.history.push(update.message);
              yield {
                taskId,
                status: "working",
                updatedAt: task.updatedAt.toISOString(),
                message: update.message,
              };
              break;

            case "status":
              task.status = update.status;
              yield this.createUpdateEvent(task);
              break;
          }
        }

        if (task.status === "working") {
          task.status = "completed";
        }
      } catch (err) {
        task.status = "failed";
        const errorMessage = err instanceof Error ? err.message : "Handler failed";
        task.history.push({
          role: "agent",
          parts: [{ type: "text", text: `Error: ${errorMessage}` }],
        });
      }
    } else if (regularHandler) {
      try {
        const result = await regularHandler(params.message, {
          taskId,
          history: task.history,
        });

        if (Array.isArray(result)) {
          task.artifacts = result;
        } else {
          task.history.push(result);
        }

        task.status = "completed";
      } catch (err) {
        task.status = "failed";
        const errorMessage = err instanceof Error ? err.message : "Handler failed";
        task.history.push({
          role: "agent",
          parts: [{ type: "text", text: `Error: ${errorMessage}` }],
        });
      }
    } else {
      task.status = "failed";
      task.history.push({
        role: "agent",
        parts: [{ type: "text", text: "No handler found for this request" }],
      });
    }

    task.updatedAt = new Date();
    yield this.createUpdateEvent(task);
  }

  subscribeToTask(taskId: string): AsyncGenerator<TaskUpdateEvent> | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    const self = this;

    return (async function* () {
      yield self.createUpdateEvent(task);

      if (["completed", "failed", "canceled"].includes(task.status)) {
        return;
      }

      const queue: TaskUpdateEvent[] = [];
      let resolve: (() => void) | null = null;

      const subscriber = (event: TaskUpdateEvent) => {
        queue.push(event);
        if (resolve) {
          resolve();
          resolve = null;
        }
      };

      task.subscribers.add(subscriber);

      try {
        while (true) {
          while (queue.length > 0) {
            const event = queue.shift()!;
            yield event;

            if (["completed", "failed", "canceled"].includes(event.status)) {
              return;
            }
          }

          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      } finally {
        task.subscribers.delete(subscriber);
      }
    })();
  }

  formatSSE(event: TaskUpdateEvent): string {
    return `event: task_update\ndata: ${JSON.stringify(event)}\n\n`;
  }

  notifySubscribers(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const event = this.createUpdateEvent(task);
    for (const subscriber of task.subscribers) {
      subscriber(event);
    }
  }

  private async handleTasksSend(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    const params = request.params as TasksSendParams;

    if (!params?.message) {
      return this.error(request.id, -32602, "Missing message parameter");
    }

    const taskId = params.taskId || this.generateId();
    let task = this.tasks.get(taskId);

    if (!task) {
      task = {
        id: taskId,
        contextId: params.contextId,
        status: "submitted",
        history: [],
        artifacts: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        subscribers: new Set(),
      };
      this.tasks.set(taskId, task);
    }

    task.history.push(params.message);
    task.status = "working";
    task.updatedAt = new Date();
    this.notifySubscribers(taskId);

    const handler = this.findHandler(params.message);

    if (handler) {
      try {
        const result = await handler(params.message, {
          taskId,
          contextId: params.contextId,
          history: task.history,
        });

        if (Array.isArray(result)) {
          task.artifacts = result;
        } else {
          task.history.push(result);
        }

        task.status = "completed";
      } catch (err) {
        task.status = "failed";
        const errorMessage = err instanceof Error ? err.message : "Handler failed";
        task.history.push({
          role: "agent",
          parts: [{ type: "text", text: `Error: ${errorMessage}` }],
        });
      }
    } else {
      task.status = "failed";
      task.history.push({
        role: "agent",
        parts: [{ type: "text", text: "No handler found for this request" }],
      });
    }

    task.updatedAt = new Date();
    this.notifySubscribers(taskId);

    return this.success(request.id, this.taskToResponse(task));
  }

  private handleTasksGet(request: JsonRpcRequest): JsonRpcResponse {
    const params = request.params as TasksGetParams;

    if (!params?.taskId) {
      return this.error(request.id, -32602, "Missing taskId parameter");
    }

    const task = this.tasks.get(params.taskId);
    if (!task) {
      return this.error(request.id, -32001, "Task not found");
    }

    return this.success(request.id, this.taskToResponse(task));
  }

  private handleTasksCancel(request: JsonRpcRequest): JsonRpcResponse {
    const params = request.params as TasksCancelParams;

    if (!params?.taskId) {
      return this.error(request.id, -32602, "Missing taskId parameter");
    }

    const task = this.tasks.get(params.taskId);
    if (!task) {
      return this.error(request.id, -32001, "Task not found");
    }

    if (["completed", "failed", "canceled"].includes(task.status)) {
      return this.error(request.id, -32001, "Task already completed");
    }

    task.status = "canceled";
    task.updatedAt = new Date();
    this.notifySubscribers(task.id);

    return this.success(request.id, this.taskToResponse(task));
  }

  private findHandler(message: A2AMessage): SkillHandler | undefined {
    return this.findHandlerInMap(this.handlers, message);
  }

  private findStreamingHandler(message: A2AMessage): StreamingSkillHandler | undefined {
    return this.findHandlerInMap(this.streamingHandlers, message);
  }

  private findHandlerInMap<T>(map: Record<string, T>, message: A2AMessage): T | undefined {
    const text = this.extractText(message);

    for (const skill of this.card.skills) {
      if (map[skill.id]) {
        if (text.toLowerCase().includes(skill.id.split(":")[1] || skill.id)) {
          return map[skill.id];
        }
      }
    }

    for (const skill of this.card.skills) {
      if (map[skill.id]) {
        return map[skill.id];
      }
    }

    const handlerIds = Object.keys(map);
    if (handlerIds.length > 0) {
      return map[handlerIds[0]];
    }

    return undefined;
  }

  private extractText(message: A2AMessage): string {
    return message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ");
  }

  private createUpdateEvent(task: TaskState): TaskUpdateEvent {
    return {
      taskId: task.id,
      status: task.status,
      updatedAt: task.updatedAt.toISOString(),
      message: task.history[task.history.length - 1],
      artifacts: task.artifacts.length > 0 ? task.artifacts : undefined,
    };
  }

  private taskToResponse(task: TaskState): A2ATask {
    return {
      taskId: task.id,
      contextId: task.contextId,
      status: {
        state: task.status,
        timestamp: task.updatedAt.toISOString(),
      },
      artifacts: task.artifacts,
      history: task.history,
    };
  }

  private success(id: string | number, result: unknown): JsonRpcResponse {
    return { jsonrpc: "2.0", id, result };
  }

  private error(id: string | number, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: "2.0", id, error: { code, message } };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export type { A2AArtifact, A2AMessage, A2ATask, AgentCard, AgentSkill, TaskUpdateEvent };
