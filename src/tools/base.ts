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

export abstract class Tool {
  abstract metadata: ToolMetadata;
  protected policyEnforcer?: PolicyEnforcer;

  abstract execute(input: ToolInput): Promise<string | object>;

  setPolicyEnforcer(enforcer: PolicyEnforcer): void {
    this.policyEnforcer = enforcer;
  }

  validate(input: ToolInput): boolean {
    for (const param of this.metadata.parameters) {
      if (param.required && !(param.name in input)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }

      if (param.name in input) {
        const value = input[param.name];
        const actualType = typeof value;

        if (param.type === 'object' && actualType !== 'object') {
          throw new Error(`Parameter ${param.name} must be an object`);
        }
        if (param.type !== 'object' && actualType !== param.type) {
          throw new Error(`Parameter ${param.name} must be of type ${param.type}`);
        }
      }
    }
    return true;
  }

  toSchema(): object {
    return {
      name: this.metadata.name,
      description: this.metadata.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          this.metadata.parameters.map((p) => [
            p.name,
            {
              type: p.type,
              description: p.description,
              ...(p.default && { default: p.default }),
            },
          ])
        ),
        required: this.metadata.parameters.filter((p) => p.required).map((p) => p.name),
      },
    };
  }
}

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private categories: Map<string, Set<string>> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.metadata.name, tool);

    // Track by category
    const category = tool.metadata.category || 'general';
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(tool.metadata.name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getTool(name: string): Tool | undefined {
    return this.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  getAllTools(): Tool[] {
    return this.list();
  }

  getSchemas(): object[] {
    return this.list().map((tool) => tool.toSchema());
  }

  getToolsByCategory(category: string): string[] {
    const tools = this.categories.get(category);
    return tools ? Array.from(tools) : [];
  }

  getAllCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  hasCategory(category: string): boolean {
    return this.categories.has(category);
  }
}
