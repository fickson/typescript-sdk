import { Tool, ToolMetadata } from './base';
export declare class HttpPostTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        body?: any;
        headers?: Record<string, string>;
    }): Promise<any>;
}
export declare class HttpPutTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        body?: any;
        headers?: Record<string, string>;
    }): Promise<any>;
}
export declare class HttpDeleteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        headers?: Record<string, string>;
    }): Promise<any>;
}
export declare class DownloadFileTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
        destination: string;
    }): Promise<{
        path: string;
        size: number;
    }>;
}
export declare class DnsLookupTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        hostname: string;
    }): Promise<{
        addresses: string[];
    }>;
}
export declare class PingTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        host: string;
        count?: number;
    }): Promise<{
        alive: boolean;
        time?: number;
    }>;
}
