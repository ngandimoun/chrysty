import { z, type ZodType } from 'zod';

import type { FormulaJsonSchema } from '@/lib/kimi/formula';

interface JsonSchemaNode {
  type?: string | string[];
  description?: string;
  enum?: unknown[];
  items?: JsonSchemaNode;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  [key: string]: unknown;
}

function nodeToZod(node: JsonSchemaNode | undefined, depth = 0): ZodType {
  if (!node || depth > 6) return z.unknown();

  const type = Array.isArray(node.type) ? node.type[0] : node.type;

  let schema: ZodType;
  switch (type) {
    case 'string':
      if (Array.isArray(node.enum) && node.enum.length > 0) {
        const values = node.enum.filter((value): value is string => typeof value === 'string');
        schema = values.length > 0 ? z.enum(values as [string, ...string[]]) : z.string();
      } else {
        schema = z.string();
      }
      break;
    case 'number':
      schema = z.number();
      break;
    case 'integer':
      schema = z.number().int();
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    case 'array':
      schema = z.array(nodeToZod(node.items, depth + 1));
      break;
    case 'object': {
      const shape: Record<string, ZodType> = {};
      const required = new Set(node.required ?? []);
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        const childSchema = nodeToZod(child, depth + 1);
        shape[key] = required.has(key) ? childSchema : childSchema.optional();
      }
      schema = z.object(shape);
      break;
    }
    default:
      schema = z.unknown();
  }

  if (typeof node.description === 'string' && node.description) {
    schema = schema.describe(node.description);
  }

  return schema;
}

/** Converts a Moonshot formula tool JSON schema into a zod object schema for Mastra tools. */
export function formulaParametersToZod(parameters: FormulaJsonSchema): z.ZodObject<Record<string, ZodType>> {
  const converted = nodeToZod(parameters as JsonSchemaNode);
  if (converted instanceof z.ZodObject) {
    return converted as z.ZodObject<Record<string, ZodType>>;
  }
  return z.object({});
}
