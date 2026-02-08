#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@microsoft/microsoft-graph-client";
import fetch from "isomorphic-fetch";
import { logger } from "./logger.js";
import { AuthManager, AuthConfig } from "./auth.js";
import { registerGraphTools } from "./graph.js";
import { registerWeatherTools } from "./weather.js";

// Global fetch polyfill required by the Microsoft Graph client
(global as any).fetch = fetch;

// Shared state
let authManager: AuthManager | null = null;
let graphClient: Client | null = null;

// Create MCP server
const server = new McpServer({
  name: "EverydayMCP",
  version: "1.0.0",
});

logger.info("Starting EverydayMCP server v1.0.0");

// Register tools ──────────────────────────────────────────────────────
registerGraphTools(
  server,
  () => graphClient,
  () => authManager,
);
registerWeatherTools(server);

// Startup ─────────────────────────────────────────────────────────────
async function main() {
  // Validate required environment variables
  const tenantId = process.env.TENANT_ID;
  const clientId = process.env.CLIENT_ID;

  if (!tenantId || !clientId) {
    const missing = [
      !tenantId && "TENANT_ID",
      !clientId && "CLIENT_ID",
    ].filter(Boolean).join(", ");
    const msg =
      `Missing required environment variable(s): ${missing}\n` +
      `Set these in your MCP client config or shell environment.\n` +
      `See README.md for instructions on creating an Entra app registration.`;
    console.error(msg);
    logger.error(msg);
    process.exit(1);
  }

  // Initialize Graph authentication (interactive / device-code)
  const authConfig: AuthConfig = {
    tenantId,
    clientId,
    redirectUri: process.env.REDIRECT_URI,
  };

  authManager = new AuthManager(authConfig);
  await authManager.initialize();

  graphClient = Client.initWithMiddleware({
    authProvider: authManager.getGraphAuthProvider(),
  });

  logger.info("Graph client initialized — interactive auth");

  // Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  logger.error("Fatal error in main()", error);
  process.exit(1);
});
