import type { PolicyEnforcer } from '../policy-enforcer';
export interface ToolInput {
    [key: string]: string | number | boolean | object;
}
export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object';
    description: string;
    required: boolean;
    default?: string | number | boolean | object;
}
export interface ToolMetadata {
    name: string;
    description: string;
    parameters: ToolParameter[];
    category?: string;
    compliance_level?: 'public' | 'internal' | 'restricted' | 'system';
    requires_approval?: boolean;
}
export declare abstract class Tool {
    abstract metadata: ToolMetadata;
    protected policyEnforcer?: PolicyEnforcer;
    abstract execute(input: ToolInput): Promise<string | object>;
    setPolicyEnforcer(enforcer: PolicyEnforcer): void;
    validate(input: ToolInput): boolean;
    toSchema(): object;
}
export declare class ToolRegistry {
    private tools;
    private categories;
    register(tool: Tool): void;
    get(name: string): Tool | undefined;
    getTool(name: string): Tool | undefined;
    list(): Tool[];
    getAllTools(): Tool[];
    getSchemas(): object[];
    getToolsByCategory(category: string): string[];
    getAllCategories(): string[];
    hasCategory(category: string): boolean;
}
