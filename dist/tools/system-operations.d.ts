import { Tool, type ToolMetadata } from './base';
export declare class GetCwdTool extends Tool {
    metadata: ToolMetadata;
    execute(): Promise<string>;
}
export declare class GetPlatformTool extends Tool {
    metadata: ToolMetadata;
    execute(): Promise<any>;
}
export declare class EnvGetTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        key: string;
    }): Promise<string>;
}
export declare class EnvSetTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        key: string;
        value: string;
    }): Promise<{
        set: boolean;
    }>;
}
