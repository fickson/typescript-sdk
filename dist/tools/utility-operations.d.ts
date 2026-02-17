import { Tool, type ToolMetadata } from './base';
export declare class DateFormatTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        date?: string | number;
        format?: string;
    }): Promise<string>;
}
export declare class GenerateUuidTool extends Tool {
    metadata: ToolMetadata;
    execute(): Promise<string>;
}
export declare class RandomNumberTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        min?: number;
        max?: number;
    }): Promise<string>;
}
export declare class SleepTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        milliseconds: number;
    }): Promise<{
        slept: number;
    }>;
}
export declare class RegexMatchTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        text: string;
        pattern: string;
        flags?: string;
    }): Promise<{
        matches: string[];
        groups?: any[];
    }>;
}
export declare class UrlParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        url: string;
    }): Promise<any>;
}
