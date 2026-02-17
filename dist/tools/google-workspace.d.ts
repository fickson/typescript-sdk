import { Tool, type ToolInput, type ToolMetadata } from './base';
export declare class GoogleDocsCreateTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<{
        documentId: string;
        url: string;
    }>;
}
