#!/usr/bin/env node
//
// One-time interactive login. Run this in your terminal BEFORE using
// the MCP server.  It opens a browser for Microsoft sign-in, then
// caches the token and saves an authentication record to disk so the
// MCP server can silently acquire tokens without a browser.
//
// Usage:  npm run login
//         npm run login -- --tenant <id> --client <id>
//

import { InteractiveBrowserCredential, useIdentityPlugin } from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { DefaultRedirectUri } from "./constants.js";
import { AUTH_RECORD_PATH, AUTH_DIR } from "./auth.js";

// Enable persistent token cache (OS keychain / encrypted file)
useIdentityPlugin(cachePersistencePlugin);

function parseArgs(): { tenantId: string; clientId: string; redirectUri: string } {
  const args = process.argv.slice(2);
  let tenantId = process.env.TENANT_ID || "";
  let clientId = process.env.CLIENT_ID || "";
  let redirectUri = process.env.REDIRECT_URI || DefaultRedirectUri;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "--tenant" || args[i] === "-t") && args[i + 1]) {
      tenantId = args[++i];
    } else if ((args[i] === "--client" || args[i] === "-c") && args[i + 1]) {
      clientId = args[++i];
    } else if ((args[i] === "--redirect" || args[i] === "-r") && args[i + 1]) {
      redirectUri = args[++i];
    }
  }

  if (!tenantId || !clientId) {
    console.error("Error: TENANT_ID and CLIENT_ID are required.\n");
    console.error("Provide them as environment variables or CLI flags:\n");
    console.error("  npm run login                            (uses env vars)");
    console.error("  npm run login -- --tenant <id> --client <id>\n");
    process.exit(1);
  }

  return { tenantId, clientId, redirectUri };
}

async function main() {
  const { tenantId, clientId, redirectUri } = parseArgs();

  console.log("Signing in to Microsoft Graph...");
  console.log(`  Tenant:   ${tenantId}`);
  console.log(`  Client:   ${clientId}`);
  console.log(`  Redirect: ${redirectUri}\n`);

  const credential = new InteractiveBrowserCredential({
    tenantId,
    clientId,
    redirectUri,
    tokenCachePersistenceOptions: { enabled: true, name: "everydaymcp" },
  });

  // Acquire token — this opens the browser
  const token = await credential.getToken("https://graph.microsoft.com/.default");
  if (!token) {
    console.error("Failed to acquire token.");
    process.exit(1);
  }

  // Save the authentication record so the MCP server can re-hydrate silently
  const record = await credential.authenticate("https://graph.microsoft.com/.default");
  if (record) {
    if (!existsSync(AUTH_DIR)) {
      mkdirSync(AUTH_DIR, { recursive: true });
    }
    writeFileSync(AUTH_RECORD_PATH, JSON.stringify(record), "utf-8");
    console.log(`\nAuthentication record saved to: ${AUTH_RECORD_PATH}`);
  }

  console.log("\nLogin successful! You can now start the MCP server.");
  console.log("The cached token will be used automatically — no browser needed.\n");
}

main().catch((err) => {
  console.error("Login failed:", err.message || err);
  process.exit(1);
});
