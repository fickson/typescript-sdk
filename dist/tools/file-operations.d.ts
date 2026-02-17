import { Tool, type ToolInput, type ToolMetadata } from './base';
export declare class FileReadTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileWriteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileListTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileAppendTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileDeleteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileMoveTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileCopyTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileStatTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileExistsTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class FileChmodTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        path: string;
        mode: string | number;
    }): Promise<{
        changed: boolean;
    }>;
}
