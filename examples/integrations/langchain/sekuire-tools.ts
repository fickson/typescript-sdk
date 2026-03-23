import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { PolicyEnforcer, Tool } from "@sekuire/sdk";
import { createDefaultToolRegistry, ToolRegistry } from "@sekuire/sdk";

function jsonSchemaPropertyToZod(
  prop: Record<string, unknown>,
  required: boolean
): z.ZodTypeAny {
  let schema: z.ZodTypeAny;

  switch (prop.type) {
    case "number":
    case "integer":
      schema = z.number();
      if (prop.enum) {
        const values = prop.enum as number[];
        schema = z.union(values.map((v) => z.literal(v)) as [z.ZodLiteral<number>, z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]);
      }
      break;
    case "boolean":
      schema = z.boolean();
      break;
    case "array": {
      const items = prop.items as Record<string, unknown> | undefined;
      const itemSchema = items ? jsonSchemaPropertyToZod(items, true) : z.any();
      schema = z.array(itemSchema);
      break;
    }
    case "object": {
      const properties = prop.properties as Record<string, Record<string, unknown>> | undefined;
      const requiredFields = (prop.required as string[]) || [];
      if (properties) {
        schema = buildZodSchema(properties, requiredFields);
      } else {
        schema = z.record(z.any());
      }
      break;
    }
    case "string":
    default: {
      schema = z.string();
      if (prop.enum) {
        const values = prop.enum as string[];
        schema = z.enum(values as [string, ...string[]]);
      }
      break;
    }
  }

  if (prop.description) {
    schema = schema.describe(String(prop.description));
  }

  if (!required) {
    schema = schema.optional();
  }

  return schema;
}

function buildZodSchema(
  properties: Record<string, Record<string, unknown>>,
  requiredFields: string[] = []
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [name, propDef] of Object.entries(properties)) {
    const isRequired = requiredFields.includes(name);
    shape[name] = jsonSchemaPropertyToZod(propDef, isRequired);
  }

  return z.object(shape);
}

export function wrapSekuireTools(
  options?: {
    enforcer?: PolicyEnforcer;
    registry?: ToolRegistry;
    filter?: string[];
  }
): DynamicStructuredTool[] {
  const registry = options?.registry ?? createDefaultToolRegistry();
  const enforcer = options?.enforcer;

  let tools: Tool[] = registry.list();

  if (options?.filter) {
    tools = tools.filter((t) => options.filter!.includes(t.metadata.name));
  }

  return tools
    .filter((tool) => {
      if (!enforcer) return true;
      try {
        enforcer.enforceTool(tool.metadata.name);
        return true;
      } catch {
        return false;
      }
    })
    .map((tool) => {
      const schema = tool.toSchema() as {
        parameters?: {
          properties?: Record<string, Record<string, unknown>>;
          required?: string[];
        };
      };
      const properties = schema.parameters?.properties || {};
      const required = schema.parameters?.required || [];
      const zodSchema = buildZodSchema(properties, required);

      return new DynamicStructuredTool({
        name: tool.metadata.name,
        description: tool.metadata.description,
        schema: zodSchema,
        func: async (args: Record<string, unknown>) => {
          if (enforcer) {
            enforcer.enforceTool(tool.metadata.name);
          }
          const result = await tool.execute(args);
          return typeof result === "string" ? result : JSON.stringify(result);
        },
      });
    });
}
