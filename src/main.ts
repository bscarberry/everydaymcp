#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { logger } from "./logger.js";
import { AuthManager, AuthMode, AuthConfig } from "./auth.js";
import { registerEntraTools } from "./entra.js";
import { registerDefenderTools } from "./defender.js";
import { registerWeatherTools } from "./weather.js";

// ── Determine auth mode from env vars ────────────────────────────────

let authMode = AuthMode.Interactive;

if (process.env.USE_DEVICE_CODE === "true") {
  authMode = AuthMode.DeviceCode;
} else if (
  process.env.TENANT_ID &&
  process.env.CLIENT_ID &&
  process.env.CLIENT_SECRET
) {
  authMode = AuthMode.ClientCredentials;
}

const authConfig: AuthConfig = {
  tenantId: process.env.TENANT_ID,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI,
  authMode,
};

// ── Authenticate — may open a browser on first run ───────────────────

logger.info("Starting EverydayMCP server v2.0.0");

const authManager = new AuthManager(authConfig);
await authManager.initialize();

const graphClient = Client.initWithMiddleware({
  authProvider: authManager.getGraphAuthProvider(),
});

// ── MCP server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "EverydayMCP",
  version: "2.0.0",
});

registerEntraTools(server, () => graphClient);
registerDefenderTools(server, () => graphClient);
registerWeatherTools(server);

// Auth status tool
server.tool(
  "get-auth-status",
  "Check authentication status, token expiry, and granted Microsoft Graph permission scopes.",
  {},
  async () => {
    const status = await authManager.getTokenStatus();
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(status, null, 2),
      }],
    };
  },
);

// ── Connect ──────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).catch((error) => {
  console.error("Fatal error:", error);
  logger.error("Fatal error connecting transport", error);
  process.exit(1);
});
