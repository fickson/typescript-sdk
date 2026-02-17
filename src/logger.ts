import axios, { type AxiosInstance } from "axios";
import { v4 as uuidv4 } from "uuid";

export type EventType =
  | "tool_execution"
  | "model_call"
  | "policy_violation"
  | "policy_check"
  | "network_access"
  | "file_access"
  | "health";

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
  onError?: (error: Error, context: { operation: string; eventsLost?: number }) => void;
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

interface RetryBatch {
  events: EventLog[];
  attempts: number;
}

export class SekuireLogger {
  private config: Required<LoggerConfig>;
  private buffer: EventLog[] = [];
  private retryQueue: RetryBatch[] = [];
  private overflowEventsTotal = 0;
  private flushTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private isFlushing = false;
  private client: AxiosInstance | null;
  private readonly sdkVersion = "typescript-sdk-0.1.0";
  private readonly apiAvailable: boolean;
  private readonly fallbackMode: FallbackMode;
  private readonly maxBufferSize: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;

  constructor(config: LoggerConfig) {
    this.config = {
      sessionId: config.sessionId || uuidv4(),
      workspaceId: config.workspaceId || undefined,
      environment: config.environment || "development",
      enabled: config.enabled !== false,
      batchSize: config.batchSize || 50,
      flushInterval: config.flushInterval || 10000,
      maxRetries: config.maxRetries ?? 3,
      retryBaseDelay: config.retryBaseDelay ?? 1000,
      apiKey: config.apiKey || undefined,
      apiBaseUrl: config.apiBaseUrl || "",
      fallback: config.fallback ?? "console",
      fallbackFilePath: config.fallbackFilePath || "./sekuire-events.ndjson",
      maxBufferSize: config.maxBufferSize ?? 1000,
      ...config,
    } as Required<LoggerConfig>;

    this.fallbackMode = this.config.fallback;
    this.maxBufferSize = this.config.maxBufferSize;
    this.maxRetries = this.config.maxRetries;
    this.retryBaseDelay = this.config.retryBaseDelay;
    this.apiAvailable = !!(this.config.apiBaseUrl);

    if (this.apiAvailable) {
      this.client = axios.create({
        baseURL: this.config.apiBaseUrl,
        timeout: 5000,
        headers: this.config.apiKey
          ? { "X-API-Key": this.config.apiKey }
          : {},
      });
    } else {
      this.client = null;
    }

    if (this.config.enabled) {
      this.startFlushTimer();
      if (this.apiAvailable) {
        this.startHeartbeatTimer();
        this.sendHealthHeartbeat();
      }
    }
  }

  public logEvent(
    eventType: EventType,
    severity: Severity,
    eventData: Record<string, any>,
  ): void {
    if (!this.config.enabled) return;

    const event: EventLog = {
      sekuire_id: this.config.sekuireId,
      session_id: this.config.sessionId,
      workspace_id: this.config.workspaceId,
      event_type: eventType,
      severity,
      event_timestamp: new Date().toISOString(),
      event_data: eventData,
      metadata: {
        sdk_version: this.sdkVersion,
        environment: this.config.environment,
      },
    };

    if (this.buffer.length >= this.maxBufferSize) {
      const overflow = this.buffer.splice(0, Math.max(1, Math.floor(this.maxBufferSize * 0.1)));
      this.overflowEventsTotal += overflow.length;
      this.writeFallback(overflow);
    }

    this.buffer.push(event);

    if (this.buffer.length >= this.config.batchSize) {
      this.flush().catch(() => {});
    }
  }

  public async flush(): Promise<void> {
    if (this.isFlushing) return;
    if (this.buffer.length === 0 && this.retryQueue.length === 0) return;

    this.isFlushing = true;

    try {
      await this.processRetryQueue();

      if (this.buffer.length === 0) return;

      const eventsToSend = this.buffer.splice(0, 100);

      if (!this.apiAvailable || !this.client) {
        this.writeFallback(eventsToSend);
        return;
      }

      try {
        await this.sendBatch(eventsToSend);
      } catch {
        this.retryQueue.push({ events: eventsToSend, attempts: 1 });
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async sendBatch(events: EventLog[]): Promise<void> {
    if (!this.client) throw new Error("No client");

    const response = await this.client.post(
      `/api/v1/agents/${this.config.sekuireId}/logs/batch`,
      { events },
    );

    if (response.data?.events_logged) {
      console.debug(
        `Logged ${response.data.events_logged}/${events.length} events to Sekuire API`,
      );
    }

    if (response.data?.errors?.length > 0) {
      console.warn("Some events failed to log:", response.data.errors);
    }
  }

  private async processRetryQueue(): Promise<void> {
    if (this.retryQueue.length === 0) return;

    if (!this.client) {
      const pending = [...this.retryQueue];
      this.retryQueue = [];
      for (const batch of pending) {
        this.writeFallback(batch.events);
      }
      return;
    }

    const pending = [...this.retryQueue];
    this.retryQueue = [];

    for (const batch of pending) {
      try {
        await this.sendBatch(batch.events);
      } catch (error: any) {
        batch.attempts++;
        if (batch.attempts > this.maxRetries) {
          this.writeFallback(batch.events);
          if (this.config.onError) {
            this.config.onError(
              error instanceof Error ? error : new Error(String(error)),
              { operation: "retry_exhausted", eventsLost: batch.events.length },
            );
          }
        } else {
          this.retryQueue.push(batch);
        }
      }
    }
  }

  private writeFallback(events: EventLog[]): void {
    if (events.length === 0) return;

    switch (this.fallbackMode) {
      case "console":
        for (const event of events) {
          process.stdout.write(JSON.stringify(event) + "\n");
        }
        break;
      case "file":
        this.writeFallbackToFile(events);
        break;
      case "silent":
        break;
    }
  }

  private writeFallbackToFile(events: EventLog[]): void {
    try {
      const fs = require("fs");
      const data = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
      fs.appendFileSync(this.config.fallbackFilePath, data, "utf-8");
    } catch {
      for (const event of events) {
        process.stdout.write(JSON.stringify(event) + "\n");
      }
    }
  }

  private async sendHealthHeartbeat(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.post(
        `/api/v1/agents/${this.config.sekuireId}/logs/health`,
        {
          sekuire_id: this.config.sekuireId,
          status: "active",
          session_id: this.config.sessionId,
          sdk_version: this.sdkVersion,
          environment: this.config.environment,
          metadata: {},
        },
      );
      console.debug("Health heartbeat sent");
    } catch (error: any) {
      console.debug("Failed to send health heartbeat:", error.message);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.config.flushInterval);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  private startHeartbeatTimer(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendHealthHeartbeat().catch(() => {});
    }, 30000);

    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  private stopTimers(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  public async shutdown(): Promise<void> {
    this.stopTimers();

    await this.flush();

    for (let i = 0; i <= this.maxRetries && this.retryQueue.length > 0; i++) {
      await this.flush();
    }

    if (this.retryQueue.length > 0) {
      const pending = [...this.retryQueue];
      this.retryQueue = [];
      for (const batch of pending) {
        this.writeFallback(batch.events);
      }
    }
  }

  public getStatus(): {
    enabled: boolean;
    bufferedEvents: number;
    sessionId: string;
    environment: string;
    apiAvailable: boolean;
    fallbackMode: FallbackMode;
    overflowEventsTotal: number;
    retryQueueSize: number;
  } {
    return {
      enabled: this.config.enabled,
      bufferedEvents: this.buffer.length,
      sessionId: this.config.sessionId,
      environment: this.config.environment,
      apiAvailable: this.apiAvailable,
      fallbackMode: this.fallbackMode,
      overflowEventsTotal: this.overflowEventsTotal,
      retryQueueSize: this.retryQueue.length,
    };
  }

  public setEnabled(enabled: boolean): void {
    if (enabled && !this.config.enabled) {
      this.config.enabled = true;
      this.startFlushTimer();
      if (this.apiAvailable) {
        this.startHeartbeatTimer();
      }
    } else if (!enabled && this.config.enabled) {
      this.config.enabled = false;
      this.stopTimers();
    }
  }
}

export default SekuireLogger;
