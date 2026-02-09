import {
  InteractiveBrowserCredential,
  DeviceCodeCredential,
  ClientSecretCredential,
  TokenCredential,
  DeviceCodeInfo,
} from "@azure/identity";
import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import { logger } from "./logger.js";
import {
  DefaultClientId,
  DefaultTenantId,
  DefaultRedirectUri,
  GRAPH_SCOPES,
} from "./constants.js";

// ── Auth modes ───────────────────────────────────────────────────────

export enum AuthMode {
  Interactive = "interactive",
  DeviceCode = "devicecode",
  ClientCredentials = "clientcredentials",
}

// ── Graph SDK auth provider wrapping any TokenCredential ─────────────

class TokenCredentialAuthProvider implements AuthenticationProvider {
  private credential: TokenCredential;

  constructor(credential: TokenCredential) {
    this.credential = credential;
  }

  async getAccessToken(): Promise<string> {
    const token = await this.credential.getToken(GRAPH_SCOPES);
    if (!token) throw new Error("Failed to acquire access token");
    return token.token;
  }
}

// ── JWT scope extraction (no external dependency) ────────────────────

function parseJwtScopes(token: string): string[] {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return [];
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(
      Buffer.from(payload, "base64").toString("utf-8"),
    );
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

// ── Auth config ──────────────────────────────────────────────────────

export interface AuthConfig {
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  authMode: AuthMode;
}

// ── Auth manager ─────────────────────────────────────────────────────

export class AuthManager {
  private credential!: TokenCredential;
  private config: AuthConfig;
  private authMode: AuthMode;

  constructor(config: AuthConfig) {
    this.config = config;
    this.authMode = config.authMode;
  }

  /**
   * Initialize the credential and acquire a token to verify auth works.
   * For interactive mode this opens a browser; for device code it prints
   * a URL and code to stderr.
   */
  async initialize(): Promise<void> {
    const tenantId = this.config.tenantId || DefaultTenantId;
    const clientId = this.config.clientId || DefaultClientId;
    const redirectUri = this.config.redirectUri || DefaultRedirectUri;

    if (!clientId) {
      throw new Error(
        "CLIENT_ID is required. Set it in your MCP client configuration (env block), " +
          "or register a default multi-tenant app and set DefaultClientId in src/constants.ts.",
      );
    }

    switch (this.authMode) {
      case AuthMode.ClientCredentials: {
        if (!this.config.clientSecret) {
          throw new Error(
            "CLIENT_SECRET is required for client credentials mode.",
          );
        }
        logger.info("Authenticating with client credentials...");
        this.credential = new ClientSecretCredential(
          tenantId,
          clientId,
          this.config.clientSecret,
        );
        break;
      }

      case AuthMode.DeviceCode: {
        logger.info("Authenticating with device code...");
        this.credential = new DeviceCodeCredential({
          tenantId,
          clientId,
          userPromptCallback: (info: DeviceCodeInfo) => {
            console.error(`\nAuthentication required:`);
            console.error(`  Visit:  ${info.verificationUri}`);
            console.error(`  Code:   ${info.userCode}\n`);
          },
        });
        break;
      }

      case AuthMode.Interactive:
      default: {
        try {
          logger.info("Authenticating interactively (browser)...");
          this.credential = new InteractiveBrowserCredential({
            tenantId,
            clientId,
            redirectUri,
          });
        } catch {
          // Fall back to device code if browser auth isn't available
          logger.info(
            "Browser auth unavailable, falling back to device code...",
          );
          this.credential = new DeviceCodeCredential({
            tenantId,
            clientId,
            userPromptCallback: (info: DeviceCodeInfo) => {
              console.error(`\nAuthentication required:`);
              console.error(`  Visit:  ${info.verificationUri}`);
              console.error(`  Code:   ${info.userCode}\n`);
            },
          });
          this.authMode = AuthMode.DeviceCode;
        }
        break;
      }
    }

    // Test the credential — this triggers the actual auth flow
    const token = await this.credential.getToken(GRAPH_SCOPES);
    if (!token) throw new Error("Failed to acquire token");
    logger.info("Authentication successful");
  }

  getGraphAuthProvider(): AuthenticationProvider {
    return new TokenCredentialAuthProvider(this.credential);
  }

  /** Check authentication status, token expiry, and scopes. */
  async getTokenStatus(): Promise<{
    isAuthenticated: boolean;
    authMode: string;
    expiresOn?: Date;
    scopes?: string[];
  }> {
    try {
      const token = await this.credential.getToken(GRAPH_SCOPES);
      if (token) {
        return {
          isAuthenticated: true,
          authMode: this.authMode,
          expiresOn: new Date(token.expiresOnTimestamp),
          scopes: parseJwtScopes(token.token),
        };
      }
    } catch (error) {
      logger.error("Error getting token status", error);
    }
    return { isAuthenticated: false, authMode: this.authMode };
  }
}
