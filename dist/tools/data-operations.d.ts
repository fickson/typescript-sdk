import { Tool, type ToolInput, type ToolMetadata } from './base';
export declare class JsonParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class Base64EncodeTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class Base64DecodeTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
export declare class HashTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
