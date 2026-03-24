#!/usr/bin/env node
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Client } from "@microsoft/microsoft-graph-client";
import fetch from "isomorphic-fetch";
import { logger } from "./logger.js";
import { AuthManager, AuthConfig } from "./auth.js";
import { registerGraphTools } from "./graph.js";
import { registerWeatherTools } from "./weather.js";

// Global fetch polyfill required by the Microsoft Graph client
(global as any).fetch = fetch;

// ── Validate required env vars ───────────────────────────────────────
const tenantId = process.env.TENANT_ID;

if (!tenantId) {
  const msg =
    "Missing required environment variable: TENANT_ID\n" +
    "Set this in your Azure Function app configuration.\n" +
    "See README.md for instructions on creating an Entra app registration.";
  console.error(msg);
  logger.error(msg);
  process.exit(1);
}

// ── Create auth manager ──────────────────────────────────────────────
// Uses DefaultAzureCredential: Managed Identity in Azure,
// Azure CLI / VS Code credentials in local development.
const authConfig: AuthConfig = { tenantId };
const authManager = new AuthManager(authConfig);

const graphClient = Client.initWithMiddleware({
  authProvider: authManager.getGraphAuthProvider(),
});

// ── MCP server factory ───────────────────────────────────────────────
// A new server instance is created per request (stateless mode).
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "EverydayMCP",
    version: "1.0.0",
  });
  registerGraphTools(server, () => graphClient, () => authManager);
  registerWeatherTools(server);
  return server;
}

// ── Express HTTP server ──────────────────────────────────────────────
const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Stateless streamable-HTTP — new transport + server per request
app.post("/mcp", async (req: Request, res: Response) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  try {
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("finish", () => transport.close());
  } catch (error: any) {
    logger.error("MCP request error", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({ error: "Method not allowed. Use POST." });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({ error: "Method not allowed." });
});

app.listen(PORT, () => {
  const msg = `EverydayMCP server v1.0.0 listening on port ${PORT}`;
  logger.info(msg);
  console.log(msg);
});
