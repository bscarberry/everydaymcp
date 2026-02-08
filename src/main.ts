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

// Validate required environment variables early
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

// Create auth manager (does NOT authenticate yet — that happens lazily
// on the first Graph tool call from the MCP client)
const authConfig: AuthConfig = {
  tenantId,
  clientId,
  redirectUri: process.env.REDIRECT_URI,
};

const authManager = new AuthManager(authConfig);

// Create Graph client with the lazy auth provider — the browser sign-in
// will only trigger when the client actually calls getAccessToken()
const graphClient = Client.initWithMiddleware({
  authProvider: authManager.getGraphAuthProvider(),
});

// Create MCP server
const server = new McpServer({
  name: "EverydayMCP",
  version: "1.0.0",
});

logger.info("Starting EverydayMCP server v1.0.0");

// Register tools
registerGraphTools(
  server,
  () => graphClient,
  () => authManager,
);
registerWeatherTools(server);

// Connect stdio transport immediately — no auth blocking startup
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("Fatal error:", error);
  logger.error("Fatal error connecting transport", error);
  process.exit(1);
});
