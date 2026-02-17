import { Tool, type ToolMetadata } from './base';
export declare class AuditLogTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        action: string;
        actor?: string;
        resource?: string;
        metadata?: any;
    }): Promise<{
        logged: boolean;
    }>;
}
export declare class PiiDetectTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        text: string;
    }): Promise<{
        detected: boolean;
        types: string[];
        matches: any[];
    }>;
}
export declare class EncryptDataTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        data: string;
        key?: string;
    }): Promise<{
        encrypted: string;
        iv: string;
    }>;
}
export declare class DecryptDataTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        encrypted: string;
        iv: string;
        key: string;
    }): Promise<string>;
}
