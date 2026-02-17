export interface SekuireExporterConfig {
    apiUrl: string;
    agentId: string;
    authToken?: string;
    workspaceId?: string;
}
export declare class SekuireSpanExporter {
    private config;
    private pendingExport;
    constructor(config: SekuireExporterConfig);
    export(spans: any[], resultCallback: (result: any) => void): void;
    private spanToEvent;
    private mapSpanToEventType;
    private getDurationMs;
    private extractAttributes;
    private sendEvents;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
}
