import { SekuireExporterConfig, SekuireSpanExporter } from './exporter';

let _otelApi: any;
let _otelExporter: any;
let _otelResources: any;
let _otelSdkTraceBase: any;
let _otelSemConv: any;

function loadOtelApi() {
  if (!_otelApi) {
    try {
      _otelApi = require('@opentelemetry/api');
    } catch {
      throw new Error(
        '@opentelemetry/api is required for telemetry. Install OpenTelemetry packages: npm install @opentelemetry/api @opentelemetry/sdk-trace-base @opentelemetry/resources @opentelemetry/semantic-conventions'
      );
    }
  }
  return _otelApi;
}

function loadOtelModules() {
  const api = loadOtelApi();

  if (!_otelResources) {
    try {
      _otelResources = require('@opentelemetry/resources');
    } catch {
      throw new Error(
        '@opentelemetry/resources is required for telemetry. Install it with: npm install @opentelemetry/resources'
      );
    }
  }

  if (!_otelSdkTraceBase) {
    try {
      _otelSdkTraceBase = require('@opentelemetry/sdk-trace-base');
    } catch {
      throw new Error(
        '@opentelemetry/sdk-trace-base is required for telemetry. Install it with: npm install @opentelemetry/sdk-trace-base'
      );
    }
  }

  if (!_otelSemConv) {
    try {
      _otelSemConv = require('@opentelemetry/semantic-conventions');
    } catch {
      throw new Error(
        '@opentelemetry/semantic-conventions is required for telemetry. Install it with: npm install @opentelemetry/semantic-conventions'
      );
    }
  }

  return { api, resources: _otelResources, sdkTraceBase: _otelSdkTraceBase, semConv: _otelSemConv };
}

function loadOtelExporter() {
  if (!_otelExporter) {
    try {
      _otelExporter = require('@opentelemetry/exporter-trace-otlp-http');
    } catch {
      throw new Error(
        '@opentelemetry/exporter-trace-otlp-http is required for OTLP export. Install it with: npm install @opentelemetry/exporter-trace-otlp-http'
      );
    }
  }
  return _otelExporter;
}

export type ExporterType = 'otlp' | 'sekuire' | 'console' | 'none';

export interface TelemetryConfig {
  enabled?: boolean;
  agentId: string;
  exporter?: ExporterType;
  otlpEndpoint?: string;
  sekuireApiUrl?: string;
  authToken?: string;
  workspaceId?: string;
  debug?: boolean;
  batchConfig?: {
    maxQueueSize?: number;
    maxExportBatchSize?: number;
    scheduledDelayMillis?: number;
  };
}

let globalProvider: any = null;
let globalTracer: any = null;

export function initTelemetry(config: TelemetryConfig): any {
  const api = loadOtelApi();

  const envEnabled = process.env.SEKUIRE_TELEMETRY === 'true';
  if (!config.enabled && !envEnabled) {
    return api.trace.getTracer('sekuire-noop');
  }

  if (globalTracer) {
    return globalTracer;
  }

  const { resources, sdkTraceBase, semConv } = loadOtelModules();

  const resource = new resources.Resource({
    [semConv.ATTR_SERVICE_NAME]: 'sekuire-agent',
    [semConv.ATTR_SERVICE_VERSION]: '0.1.0',
    'sekuire.agent_id': config.agentId,
  });

  globalProvider = new sdkTraceBase.BasicTracerProvider({ resource });

  const batchConfig = {
    maxQueueSize: config.batchConfig?.maxQueueSize ?? 100,
    maxExportBatchSize: config.batchConfig?.maxExportBatchSize ?? 50,
    scheduledDelayMillis: config.batchConfig?.scheduledDelayMillis ?? 5000,
  };

  const exporterType = config.exporter ?? 'otlp';

  switch (exporterType) {
    case 'otlp': {
      const otlpMod = loadOtelExporter();
      const endpoint = config.otlpEndpoint ?? 'http://localhost:4318/v1/traces';
      const otlpExporter = new otlpMod.OTLPTraceExporter({ url: endpoint });
      globalProvider.addSpanProcessor(
        new sdkTraceBase.BatchSpanProcessor(otlpExporter, batchConfig)
      );
      break;
    }
    case 'sekuire': {
      if (!config.sekuireApiUrl) {
        throw new Error('sekuireApiUrl required when using sekuire exporter');
      }
      const sekuireConfig: SekuireExporterConfig = {
        apiUrl: config.sekuireApiUrl,
        agentId: config.agentId,
        authToken: config.authToken,
        workspaceId: config.workspaceId,
      };
      globalProvider.addSpanProcessor(
        new sdkTraceBase.BatchSpanProcessor(new SekuireSpanExporter(sekuireConfig), batchConfig)
      );
      break;
    }
    case 'console':
      globalProvider.addSpanProcessor(
        new sdkTraceBase.SimpleSpanProcessor(new sdkTraceBase.ConsoleSpanExporter())
      );
      break;
    case 'none':
      break;
  }

  if (config.debug && exporterType !== 'console') {
    globalProvider.addSpanProcessor(
      new sdkTraceBase.SimpleSpanProcessor(new sdkTraceBase.ConsoleSpanExporter())
    );
  }

  globalProvider.register();
  globalTracer = api.trace.getTracer('sekuire-agent');

  return globalTracer;
}

export function getTracer(): any {
  if (globalTracer) return globalTracer;
  try {
    const api = loadOtelApi();
    return api.trace.getTracer('sekuire-noop');
  } catch {
    return {
      startActiveSpan: (_name: string, fn: (span: any) => any) =>
        fn({
          setAttribute: () => {},
          setStatus: () => {},
          end: () => {},
          recordException: () => {},
        }),
    };
  }
}

export function withSpan<T>(name: string, fn: (span: any) => T): T {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, (span: any) => {
    try {
      const result = fn(span);
      if (result instanceof Promise) {
        return result
          .then((value: any) => {
            span.setStatus({ code: 0 });
            span.end();
            return value;
          })
          .catch((error: any) => {
            span.setStatus({ code: 2, message: error.message });
            span.recordException(error);
            span.end();
            throw error;
          }) as unknown as T;
      }
      span.setStatus({ code: 0 });
      span.end();
      return result;
    } catch (error) {
      span.setStatus({ code: 2, message: (error as Error).message });
      span.recordException(error as Error);
      span.end();
      throw error;
    }
  });
}

export async function shutdownTelemetry(): Promise<void> {
  if (globalProvider) {
    await globalProvider.shutdown();
    globalProvider = null;
    globalTracer = null;
  }
}

export { SekuireSpanExporter, type SekuireExporterConfig } from './exporter';
