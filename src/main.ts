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

// ── Validate required env vars ───────────────────────────────────────
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

// ── Create auth manager (uses cached token — no browser) ─────────────
const authConfig: AuthConfig = {
  tenantId,
  clientId,
  redirectUri: process.env.REDIRECT_URI,
};

const authManager = new AuthManager(authConfig);

if (!authManager.hasAuthRecord()) {
  console.error(
    "No cached login found. Run 'npm run login' in your terminal first,\n" +
    "then restart the MCP server.",
  );
}

// Graph client — token acquisition is silent via the cached credential
const graphClient = Client.initWithMiddleware({
  authProvider: authManager.getGraphAuthProvider(),
});

// ── MCP server ───────────────────────────────────────────────────────
const server = new McpServer({
  name: "EverydayMCP",
  version: "1.0.0",
});

logger.info("Starting EverydayMCP server v1.0.0");

registerGraphTools(server, () => graphClient, () => authManager);
registerWeatherTools(server);

// Connect stdio transport immediately — no blocking auth
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("Fatal error:", error);
  logger.error("Fatal error connecting transport", error);
  process.exit(1);
});
