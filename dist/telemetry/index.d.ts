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
export declare function initTelemetry(config: TelemetryConfig): any;
export declare function getTracer(): any;
export declare function withSpan<T>(name: string, fn: (span: any) => T): T;
export declare function shutdownTelemetry(): Promise<void>;
export { SekuireSpanExporter, type SekuireExporterConfig } from './exporter';
