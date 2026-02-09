import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  PublicClientApplication,
  Configuration,
  AccountInfo,
  SilentFlowRequest,
} from "@azure/msal-node";
import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import { logger } from "./logger.js";
import { GRAPH_SCOPES } from "./constants.js";

// ── Cache paths ──────────────────────────────────────────────────────

export const AUTH_DIR = join(homedir(), ".everydaymcp");
export const CACHE_PATH = join(AUTH_DIR, "msal-cache.json");

// ── MSAL cache plugin (file-based persistence) ──────────────────────

/**
 * Creates an MSAL cache plugin that persists the token cache to disk.
 * Shared between the login CLI and the MCP server so both operate on
 * the same cache file at ~/.everydaymcp/msal-cache.json.
 */
export function createCachePlugin() {
  return {
    beforeCacheAccess: async (context: { tokenCache: { deserialize(cache: string): void } }) => {
      if (existsSync(CACHE_PATH)) {
        context.tokenCache.deserialize(readFileSync(CACHE_PATH, "utf-8"));
      }
    },
    afterCacheAccess: async (context: { tokenCache: { serialize(): string }; cacheHasChanged: boolean }) => {
      if (context.cacheHasChanged) {
        if (!existsSync(AUTH_DIR)) {
          mkdirSync(AUTH_DIR, { recursive: true });
        }
        writeFileSync(CACHE_PATH, context.tokenCache.serialize());
      }
    },
  };
}

// ── JWT scope extraction (no external dependency) ────────────────────

function parseJwtScopes(token: string): string[] {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return [];
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    if (typeof decoded.scp === "string") {
      return decoded.scp.split(" ").filter((s: string) => s.length > 0);
    }
    if (Array.isArray(decoded.roles)) {
      return decoded.roles;
    }
    return [];
  } catch {
    return [];
  }
}

// ── Auth provider for the Graph SDK ──────────────────────────────────

class MsalAuthProvider implements AuthenticationProvider {
  private authManager: AuthManager;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
  }

  async getAccessToken(): Promise<string> {
    const { accessToken } = await this.authManager.acquireToken();
    return accessToken;
  }
}

// ── Auth config ──────────────────────────────────────────────────────

export interface AuthConfig {
  tenantId: string;
  clientId: string;
}

// ── Auth manager (MSAL-based) ────────────────────────────────────────

export class AuthManager {
  private pca: PublicClientApplication;
  private account: AccountInfo | null = null;

  constructor(config: AuthConfig) {
    const msalConfig: Configuration = {
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
      cache: {
        cachePlugin: createCachePlugin(),
      },
    };

    this.pca = new PublicClientApplication(msalConfig);
  }

  /** Load cached accounts from the MSAL token cache. */
  async initialize(): Promise<void> {
    const cache = this.pca.getTokenCache();
    const accounts = await cache.getAllAccounts();
    if (accounts.length > 0) {
      this.account = accounts[0];
      logger.info(`Loaded cached account: ${this.account.username}`);
    } else {
      logger.error(
        "No cached account found. Run 'npm run login' to sign in first.",
      );
    }
  }

  hasAccount(): boolean {
    return this.account !== null;
  }

  /** Silently acquire an access token using the cached account. */
  async acquireToken(): Promise<{ accessToken: string; expiresOn: Date | null }> {
    if (!this.account) {
      throw new Error(
        "Not authenticated. Run 'npm run login' in your terminal first, " +
        "then restart the MCP server.",
      );
    }

    const request: SilentFlowRequest = {
      account: this.account,
      scopes: GRAPH_SCOPES,
    };

    try {
      const result = await this.pca.acquireTokenSilent(request);
      return { accessToken: result.accessToken, expiresOn: result.expiresOn };
    } catch {
      throw new Error(
        "Token acquisition failed. Your cached token may have expired. " +
        "Re-run 'npm run login'.",
      );
    }
  }

  /** Returns an AuthenticationProvider compatible with the Graph SDK. */
  getGraphAuthProvider(): AuthenticationProvider {
    return new MsalAuthProvider(this);
  }

  /** Check authentication status, token expiry, and scopes. */
  async getTokenStatus(): Promise<{
    isAuthenticated: boolean;
    account?: string;
    expiresOn?: Date;
    scopes?: string[];
  }> {
    if (!this.account) return { isAuthenticated: false };
    try {
      const { accessToken, expiresOn } = await this.acquireToken();
      return {
        isAuthenticated: true,
        account: this.account.username,
        expiresOn: expiresOn ?? undefined,
        scopes: parseJwtScopes(accessToken),
      };
    } catch (error) {
      logger.error("Error getting token status", error);
      return { isAuthenticated: false };
    }
  }
}
