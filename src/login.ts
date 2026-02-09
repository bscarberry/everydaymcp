#!/usr/bin/env node
//
// One-time interactive login. Run this in your terminal BEFORE using
// the MCP server.  It opens a browser for Microsoft sign-in via MSAL,
// then caches the tokens to disk so the MCP server can silently acquire
// tokens without a browser.
//
// Usage:  npm run login
//         npm run login -- --tenant <id> --client <id>
//

import { PublicClientApplication, Configuration } from "@azure/msal-node";
import { exec } from "child_process";
import { createCachePlugin, CACHE_PATH } from "./auth.js";
import { GRAPH_SCOPES } from "./constants.js";

// ── CLI argument parsing ─────────────────────────────────────────────

function parseArgs(): { tenantId: string; clientId: string } {
  const args = process.argv.slice(2);
  let tenantId = process.env.TENANT_ID || "";
  let clientId = process.env.CLIENT_ID || "";

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--tenant" || args[i] === "-t") && args[i + 1]) {
      tenantId = args[++i];
    } else if ((args[i] === "--client" || args[i] === "-c") && args[i + 1]) {
      clientId = args[++i];
    }
  }

  if (!tenantId || !clientId) {
    console.error("Error: TENANT_ID and CLIENT_ID are required.\n");
    console.error("Provide them as environment variables or CLI flags:\n");
    console.error("  npm run login                            (uses env vars)");
    console.error("  npm run login -- --tenant <id> --client <id>\n");
    process.exit(1);
  }

  return { tenantId, clientId };
}

// ── Browser launcher ─────────────────────────────────────────────────

function openSystemBrowser(url: string): Promise<void> {
  return new Promise((resolve) => {
    const cmd =
      process.platform === "win32"
        ? `start "" "${url}"`
        : process.platform === "darwin"
          ? `open "${url}"`
          : `xdg-open "${url}"`;

    console.log(
      `\nIf the browser doesn't open automatically, navigate to:\n${url}\n`,
    );
    exec(cmd, () => resolve());
  });
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const { tenantId, clientId } = parseArgs();

  console.log("Signing in to Microsoft Graph via MSAL...");
  console.log(`  Tenant: ${tenantId}`);
  console.log(`  Client: ${clientId}`);

  const msalConfig: Configuration = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
    cache: {
      cachePlugin: createCachePlugin(),
    },
  };

  const pca = new PublicClientApplication(msalConfig);

  const result = await pca.acquireTokenInteractive({
    scopes: GRAPH_SCOPES,
    openBrowser: openSystemBrowser,
    successTemplate:
      "<h1>Authentication successful!</h1>" +
      "<p>You can close this window and return to your terminal.</p>",
    errorTemplate:
      "<h1>Authentication failed</h1><p>Error: {{error}}</p>",
  });

  console.log(`\nLogin successful!`);
  console.log(`  Account: ${result.account?.username}`);
  console.log(`  Token cache saved to: ${CACHE_PATH}`);
  console.log(
    `\nYou can now start the MCP server. Tokens will refresh automatically.\n`,
  );
}

main().catch((err) => {
  console.error("Login failed:", err.message || err);
  process.exit(1);
});
