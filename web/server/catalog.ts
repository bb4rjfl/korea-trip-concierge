/**
 * Web-side tool catalog: wraps the 13 MCP tool definitions (src/tools) for
 * in-process execution — no MCP transport hop.
 *
 * - Validates args with each tool's own zod shape BEFORE calling the handler
 *   (the MCP SDK did this at the transport layer; calling handlers directly
 *   would otherwise skip validation).
 * - Exposes a JSON-Schema-ish view of each input shape for LLM function calling.
 */

import { z } from "zod";
import { ALL_TOOLS } from "../../src/tools/index.js";
import type { ToolDef } from "../../src/tools/types.js";

export interface ParamSchema {
  type: "string" | "number" | "boolean" | "array";
  description?: string;
  items?: { type: "string" };
}

export interface FunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ParamSchema>;
    required?: string[];
  };
}

export interface CatalogTool {
  name: string;
  def: ToolDef;
  validator: z.ZodObject<z.ZodRawShape>;
  declaration: FunctionDeclaration;
}

/** Unwrap Optional/Default wrappers; collect the outermost description. */
function unwrap(schema: z.ZodTypeAny): { inner: z.ZodTypeAny; optional: boolean; description?: string } {
  let cur: z.ZodTypeAny = schema;
  let optional = false;
  let description: string | undefined = cur.description;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let def = (cur as any)._def;
  while (def?.typeName === "ZodOptional" || def?.typeName === "ZodDefault" || def?.typeName === "ZodNullable") {
    if (def.typeName !== "ZodDefault") optional = true;
    cur = def.innerType;
    description ??= cur.description;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    def = (cur as any)._def;
  }
  return { inner: cur, optional, description };
}

function toParamSchema(schema: z.ZodTypeAny): ParamSchema {
  const { inner, description } = unwrap(schema);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeName = (inner as any)._def?.typeName as string | undefined;
  switch (typeName) {
    case "ZodNumber":
      return { type: "number", description };
    case "ZodBoolean":
      return { type: "boolean", description };
    case "ZodArray":
      return { type: "array", items: { type: "string" }, description };
    case "ZodString":
    case "ZodEnum":
    case "ZodUnion": // our only union is number|string — string carries both
    default:
      return { type: "string", description };
  }
}

function buildCatalog(): CatalogTool[] {
  return ALL_TOOLS.map((def) => {
    const properties: Record<string, ParamSchema> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(def.inputSchema)) {
      properties[key] = toParamSchema(schema as z.ZodTypeAny);
      if (!unwrap(schema as z.ZodTypeAny).optional) required.push(key);
    }
    return {
      name: def.name,
      def,
      // .strip() (default) drops unknown keys so junk args never reach handlers.
      validator: z.object(def.inputSchema),
      declaration: {
        name: def.name,
        description: def.description,
        parameters: { type: "object", properties, ...(required.length ? { required } : {}) },
      },
    };
  });
}

export const CATALOG: CatalogTool[] = buildCatalog();
export const CATALOG_BY_NAME = new Map(CATALOG.map((t) => [t.name, t]));

export type ExecuteResult =
  | { ok: true; markdown: string; ms: number }
  | { ok: false; invalidArgs: string[] };

/**
 * Validate args and run the tool handler. Unknown tool names throw (programmer
 * error); invalid args return a structured failure the orchestrator turns into
 * a friendly follow-up question.
 */
export async function executeTool(name: string, args: Record<string, unknown>): Promise<ExecuteResult> {
  const tool = CATALOG_BY_NAME.get(name);
  if (!tool) throw new Error(`unknown tool: ${name}`);

  const parsed = tool.validator.safeParse(args ?? {});
  if (!parsed.success) {
    const invalid = [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "input")))];
    return { ok: false, invalidArgs: invalid };
  }

  const start = Date.now();
  const result = await tool.def.handler(parsed.data as Record<string, unknown>);
  const markdown = result.content.map((c) => c.text).join("\n\n");
  return { ok: true, markdown, ms: Date.now() - start };
}
