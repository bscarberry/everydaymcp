import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  InteractiveBrowserCredential,
  AuthenticationRecord,
  useIdentityPlugin,
} from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";
import { DefaultRedirectUri } from "./constants.js";

// Enable persistent token cache (OS keychain / encrypted file)
useIdentityPlugin(cachePersistencePlugin);

// Where the login CLI saves the authentication record
export const AUTH_DIR = join(homedir(), ".everydaymcp");
export const AUTH_RECORD_PATH = join(AUTH_DIR, "auth-record.json");

// ── Helpers ──────────────────────────────────────────────────────────

function parseJwtScopes(token: string): string[] {
  try {
    const decoded = jwt.decode(token) as any;
    if (!decoded || typeof decoded !== "object") return [];
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

export class TokenCredentialAuthProvider implements AuthenticationProvider {
  private authManager: AuthManager;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
  }

  async getAccessToken(): Promise<string> {
    const credential = this.authManager.getCredential();
    const token = await credential.getToken("https://graph.microsoft.com/.default");
    if (!token) throw new Error("Failed to acquire access token");
    return token.token;
  }
}

// ── Auth config & manager ────────────────────────────────────────────

export interface AuthConfig {
  tenantId: string;
  clientId: string;
  redirectUri?: string;
}

export class AuthManager {
  private credential: InteractiveBrowserCredential;
  private config: AuthConfig;
  private isReady: boolean;

  constructor(config: AuthConfig) {
    this.config = config;

    // Try to load the saved authentication record from disk
    let authRecord: AuthenticationRecord | undefined;
    if (existsSync(AUTH_RECORD_PATH)) {
      try {
        const raw = readFileSync(AUTH_RECORD_PATH, "utf-8");
        authRecord = JSON.parse(raw) as AuthenticationRecord;
        logger.info("Loaded cached authentication record");
      } catch (err) {
        logger.error("Failed to read auth record, will require fresh login", err);
      }
    }

    if (!authRecord) {
      logger.error(
        "No authentication record found. Run 'npm run login' to sign in first.",
      );
    }

    this.isReady = !!authRecord;

    // Create credential with the cached record + persistent token cache.
    // With both in place, token acquisition is silent (no browser).
    this.credential = new InteractiveBrowserCredential({
      tenantId: config.tenantId,
      clientId: config.clientId,
      redirectUri: config.redirectUri || DefaultRedirectUri,
      tokenCachePersistenceOptions: { enabled: true, name: "everydaymcp" },
      ...(authRecord ? { authenticationRecord: authRecord } : {}),
    });
  }

  /**
   * Attempt interactive browser login if no cached auth record exists.
   * Opens the user's browser for Microsoft sign-in, then saves the
   * authentication record so subsequent startups are silent.
   */
  async ensureAuthenticated(): Promise<void> {
    if (this.isReady) return;

    logger.info("No cached login found — starting interactive browser sign-in");
    console.error("No cached login found. Opening browser for sign-in...");

    try {
      const token = await this.credential.getToken(
        "https://graph.microsoft.com/.default",
      );
      if (!token) {
        throw new Error("Failed to acquire token from interactive sign-in");
      }

      const record = await this.credential.authenticate(
        "https://graph.microsoft.com/.default",
      );
      if (record) {
        if (!existsSync(AUTH_DIR)) {
          mkdirSync(AUTH_DIR, { recursive: true });
        }
        writeFileSync(AUTH_RECORD_PATH, JSON.stringify(record), "utf-8");
        logger.info(`Authentication record saved to ${AUTH_RECORD_PATH}`);
        console.error("Login successful! Authentication record saved.");
      }

      this.isReady = true;
      logger.info("Interactive sign-in completed successfully");
    } catch (err: any) {
      const msg = err?.message || String(err);
      logger.error("Interactive sign-in failed", err);
      console.error(
        `Interactive sign-in failed: ${msg}\n` +
        "You can also run 'npm run login' in your terminal, then restart the MCP server.",
      );
    }
  }

  getCredential(): InteractiveBrowserCredential {
    if (!this.isReady) {
      throw new Error(
        "Not authenticated. Run 'npm run login' in your terminal first, " +
        "then restart the MCP server.",
      );
    }
    return this.credential;
  }

  getGraphAuthProvider(): TokenCredentialAuthProvider {
    return new TokenCredentialAuthProvider(this);
  }

  hasAuthRecord(): boolean {
    return this.isReady;
  }

  async getTokenStatus(): Promise<{
    isAuthenticated: boolean;
    expiresOn?: Date;
    scopes?: string[];
  }> {
    if (!this.isReady) return { isAuthenticated: false };
    try {
      const token = await this.credential.getToken(
        "https://graph.microsoft.com/.default",
      );
      if (token) {
        return {
          isAuthenticated: true,
          expiresOn: new Date(token.expiresOnTimestamp),
          scopes: parseJwtScopes(token.token),
        };
      }
    } catch (error) {
      logger.error("Error getting token status", error);
    }
    return { isAuthenticated: false };
  }
}
