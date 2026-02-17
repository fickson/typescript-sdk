let _otelCore: any;
let _otelSdkTraceBase: any;

function loadOtelCore() {
  if (!_otelCore) {
    try {
      _otelCore = require('@opentelemetry/core');
    } catch {
      throw new Error(
        '@opentelemetry/core is required for telemetry. Install it with: npm install @opentelemetry/core'
      );
    }
  }
  return _otelCore;
}

function loadOtelSdkTraceBase() {
  if (!_otelSdkTraceBase) {
    try {
      _otelSdkTraceBase = require('@opentelemetry/sdk-trace-base');
    } catch {
      throw new Error(
        '@opentelemetry/sdk-trace-base is required for telemetry. Install it with: npm install @opentelemetry/sdk-trace-base'
      );
    }
  }
  return _otelSdkTraceBase;
}

export interface SekuireExporterConfig {
  apiUrl: string;
  agentId: string;
  authToken?: string;
  workspaceId?: string;
}

export class SekuireSpanExporter {
  private config: SekuireExporterConfig;
  private pendingExport: Promise<void> | null = null;

  constructor(config: SekuireExporterConfig) {
    this.config = config;
  }

  export(spans: any[], resultCallback: (result: any) => void): void {
    const { ExportResultCode } = loadOtelCore();
    const events = spans.map((span: any) => this.spanToEvent(span));

    if (events.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    this.pendingExport = this.sendEvents(events)
      .then(() => {
        resultCallback({ code: ExportResultCode.SUCCESS });
      })
      .catch((error: any) => {
        console.debug('Failed to export spans to Sekuire:', error.message);
        resultCallback({ code: ExportResultCode.FAILED });
      })
      .finally(() => {
        this.pendingExport = null;
      });
  }

  private spanToEvent(span: any): Record<string, unknown> {
    const eventType = this.mapSpanToEventType(span.name);
    const severity = span.status.code === 2 ? 'error' : 'info';

    return {
      sekuire_id: this.config.agentId,
      session_id: span.spanContext().traceId,
      workspace_id: this.config.workspaceId,
      event_type: eventType,
      severity,
      event_timestamp: new Date(span.startTime[0] * 1000 + span.startTime[1] / 1e6).toISOString(),
      event_data: {
        message: span.name,
        duration_ms: this.getDurationMs(span),
        ...this.extractAttributes(span),
      },
      metadata: {
        sdk_version: 'typescript-sdk-otel',
        trace_id: span.spanContext().traceId,
        span_id: span.spanContext().spanId,
        parent_span_id: span.parentSpanId,
      },
    };
  }

  private mapSpanToEventType(spanName: string): string {
    if (spanName.startsWith('tool:')) return 'tool_execution';
    if (spanName.startsWith('chat')) return 'model_call';
    if (spanName.includes('policy')) return 'policy_check';
    return 'model_call';
  }

  private getDurationMs(span: any): number {
    const startMs = span.startTime[0] * 1000 + span.startTime[1] / 1e6;
    const endMs = span.endTime[0] * 1000 + span.endTime[1] / 1e6;
    return Math.round(endMs - startMs);
  }

  private extractAttributes(span: any): Record<string, unknown> {
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(span.attributes)) {
      attrs[key] = value;
    }
    if (span.status.message) {
      attrs.status_message = span.status.message;
    }
    return attrs;
  }

  private async sendEvents(events: Record<string, unknown>[]): Promise<void> {
    const url = `${this.config.apiUrl}/api/v1/agents/${this.config.agentId}/logs/batch`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.authToken && { Authorization: `Bearer ${this.config.authToken}` }),
      },
      body: JSON.stringify({ events }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  }

  async shutdown(): Promise<void> {
    if (this.pendingExport) {
      await this.pendingExport;
    }
  }

  async forceFlush(): Promise<void> {
    if (this.pendingExport) {
      await this.pendingExport;
    }
  }
}
