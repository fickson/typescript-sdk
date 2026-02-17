/**
 * A2A Task Delegator
 *
 * Enables agents to delegate tasks to other agents and receive completion callbacks.
 * Provides a complete feedback loop for multi-agent orchestration.
 */
import type { PolicyGateway } from "./policy-gateway";
import type { A2AMessage, A2ATaskState, TaskUpdateEvent } from "./types/a2a-types";
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
export declare class A2ATaskDelegator {
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
export declare function createDelegator(config: DelegatorConfig): A2ATaskDelegator;
