import { Tool, ToolMetadata } from './base';
export declare class JsonStringifyTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        data: any;
        pretty?: boolean;
    }): Promise<string>;
}
export declare class CsvParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        csv: string;
        delimiter?: string;
        headers?: boolean;
    }): Promise<any[]>;
}
export declare class CsvWriteTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        data: any[];
        delimiter?: string;
        headers?: boolean;
    }): Promise<string>;
}
export declare class YamlParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        yaml: string;
    }): Promise<any>;
}
export declare class XmlParseTool extends Tool {
    metadata: ToolMetadata;
    execute(input: {
        xml: string;
    }): Promise<any>;
}
