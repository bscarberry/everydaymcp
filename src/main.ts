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
  // Initialize Graph authentication (interactive / device-code)
  const authConfig: AuthConfig = {
    tenantId: process.env.TENANT_ID,
    clientId: process.env.CLIENT_ID,
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
