import { Tool, type ToolInput, type ToolMetadata } from './base';
export declare class DirectoryListTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class DirectoryMkdirTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class DirectoryRmdirTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class DirectoryRmRecursiveTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class DirectoryExistsTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class DirectoryMoveTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        source: string;
        destination: string;
    }): Promise<{
        moved: boolean;
    }>;
}
export declare class DirectoryCopyTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        source: string;
        destination: string;
    }): Promise<{
        copied: boolean;
    }>;
}
export declare class DirectoryTreeTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        path: string;
        depth?: number;
    }): Promise<any>;
}
