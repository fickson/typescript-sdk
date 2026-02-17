export type EventType = "tool_execution" | "model_call" | "policy_violation" | "policy_check" | "network_access" | "file_access" | "health";
export type Severity = "debug" | "info" | "warn" | "error";
export type FallbackMode = "console" | "file" | "silent";
export interface LoggerConfig {
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
export interface EventLog {
    sekuire_id: string;
    session_id: string;
    workspace_id?: string;
    event_type: EventType;
    severity: Severity;
    event_timestamp: string;
    event_data: Record<string, any>;
    metadata: Record<string, any>;
}
export declare class SekuireLogger {
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
    constructor(config: LoggerConfig);
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
export default SekuireLogger;
