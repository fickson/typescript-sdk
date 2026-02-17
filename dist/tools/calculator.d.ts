import { Tool, type ToolInput, type ToolMetadata } from './base';
export declare class CalculatorTool extends Tool {
    metadata: ToolMetadata;
    execute(input: ToolInput): Promise<string>;
}
