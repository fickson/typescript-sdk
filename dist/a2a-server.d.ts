/**
 * A2A Protocol Server
 *
 * Server implementation for creating A2A-compliant agents with streaming support.
 */
import type { A2AArtifact, A2AMessage, A2ATask, A2ATaskState, AgentCard, AgentSkill, JsonRpcRequest, JsonRpcResponse, TaskUpdateEvent } from "./types/a2a-types";
import { AgentIdentity } from "./identity";
export interface A2AServerOptions {
    card: AgentCard;
    identity?: AgentIdentity;
    port?: number;
    handlers: Record<string, SkillHandler>;
    streamingHandlers?: Record<string, StreamingSkillHandler>;
}
export type SkillHandler = (message: A2AMessage, context: SkillContext) => Promise<A2AMessage | A2AArtifact[]>;
export type StreamingSkillHandler = (message: A2AMessage, context: StreamingSkillContext) => AsyncGenerator<StreamingUpdate>;
export interface SkillContext {
    taskId: string;
    contextId?: string;
    history: A2AMessage[];
}
export interface StreamingSkillContext extends SkillContext {
    emit: (update: StreamingUpdate) => void;
}
export type StreamingUpdate = {
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
export declare class A2AServer {
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
export type { A2AArtifact, A2AMessage, A2ATask, AgentCard, AgentSkill, TaskUpdateEvent };
