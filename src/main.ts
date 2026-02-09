#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@microsoft/microsoft-graph-client";
import { logger } from "./logger.js";
import { AuthManager, AuthConfig } from "./auth.js";
import { registerEntraTools } from "./entra.js";
import { registerDefenderTools } from "./defender.js";
import { registerWeatherTools } from "./weather.js";

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

// ── Create auth manager (MSAL — uses cached token, no browser) ───────

const authConfig: AuthConfig = { tenantId, clientId };
const authManager = new AuthManager(authConfig);

// AuthManager.initialize() is async because MSAL loads the cache via plugin
await authManager.initialize();

if (!authManager.hasAccount()) {
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
  version: "2.0.0",
});

logger.info("Starting EverydayMCP server v2.0.0");

// Register tool groups
registerEntraTools(server, () => graphClient);
registerDefenderTools(server, () => graphClient);
registerWeatherTools(server);

// Auth status tool — registered here because it needs the auth manager
server.tool(
  "get-auth-status",
  "Check the current MSAL authentication status, token expiration, " +
  "and granted Microsoft Graph permission scopes.",
  {},
  async () => {
    const tokenStatus = await authManager.getTokenStatus();
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          authMethod: "msal",
          tokenStatus,
          timestamp: new Date().toISOString(),
        }, null, 2),
      }],
    };
  },
);

// Connect stdio transport — no blocking auth
const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("Fatal error:", error);
  logger.error("Fatal error connecting transport", error);
  process.exit(1);
});
