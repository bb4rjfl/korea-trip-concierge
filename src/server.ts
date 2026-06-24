import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SERVER_NAME, SERVER_VERSION } from "./lib/constants.js";
import { assertNamingOk } from "./lib/naming.js";
import { ENV } from "./lib/env.js";
import { ALL_TOOLS, TOOL_NAMES } from "./tools/index.js";

// Fail fast at startup if any name breaks Kakao rules (kakao token, charset,
// duplicates, count) — a non-compliant build never serves traffic.
assertNamingOk(SERVER_NAME, TOOL_NAMES);

/** Build a fresh MCP server with all tools registered (one per request: stateless). */
function buildServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => tool.handler(args),
    );
  }
  return server;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check (KC / load balancers).
app.get("/", (_req: Request, res: Response) => {
  res.json({ name: SERVER_NAME, version: SERVER_VERSION, tools: TOOL_NAMES.length, status: "ok" });
});

// Streamable HTTP, stateless: new server + transport per request, no sessions.
app.post("/mcp", async (req: Request, res: Response) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless: GET (SSE stream) and DELETE (session teardown) are not supported.
const methodNotAllowed = (_req: Request, res: Response) =>
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed (stateless server)." },
    id: null,
  });
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const port = Number(ENV.PORT);
app.listen(port, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} — Streamable HTTP (stateless) on :${port}`);
  console.log(`Tools (${TOOL_NAMES.length}): ${TOOL_NAMES.join(", ")}`);
});
