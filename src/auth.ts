import {
  TokenCredential,
  InteractiveBrowserCredential,
} from "@azure/identity";
import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";
import { DefaultRedirectUri } from "./constants.js";

// Helper: decode JWT and extract scopes
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

// Adapts Azure Identity credentials for the Graph SDK.
// Triggers interactive browser auth lazily on the first call.
export class TokenCredentialAuthProvider implements AuthenticationProvider {
  private authManager: AuthManager;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
  }

  async getAccessToken(): Promise<string> {
    const credential = await this.authManager.ensureAuthenticated();
    const token = await credential.getToken("https://graph.microsoft.com/.default");
    if (!token) throw new Error("Failed to acquire access token");
    return token.token;
  }
}

export interface AuthConfig {
  tenantId: string;
  clientId: string;
  redirectUri?: string;
}

export class AuthManager {
  private credential: InteractiveBrowserCredential | null = null;
  private config: AuthConfig;
  private authPromise: Promise<InteractiveBrowserCredential> | null = null;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  // Lazily authenticate on first use. Returns the credential, opening a
  // browser sign-in window only when actually needed. Subsequent calls
  // return the already-resolved credential.
  async ensureAuthenticated(): Promise<InteractiveBrowserCredential> {
    if (this.credential) return this.credential;

    // Deduplicate concurrent calls so the browser only opens once
    if (!this.authPromise) {
      this.authPromise = this.authenticate();
    }
    return this.authPromise;
  }

  private async authenticate(): Promise<InteractiveBrowserCredential> {
    const { tenantId, clientId } = this.config;
    const redirectUri = this.config.redirectUri || DefaultRedirectUri;

    logger.info(`Opening browser for interactive authentication (tenant: ${tenantId}, client: ${clientId})`);

    const cred = new InteractiveBrowserCredential({
      tenantId,
      clientId,
      redirectUri,
    });

    // Acquire an initial token to force the browser prompt now
    const token = await cred.getToken("https://graph.microsoft.com/.default");
    if (!token) throw new Error("Failed to acquire token via interactive browser sign-in");

    logger.info("Interactive browser authentication successful");
    this.credential = cred;
    return cred;
  }

  getGraphAuthProvider(): TokenCredentialAuthProvider {
    return new TokenCredentialAuthProvider(this);
  }

  async getTokenStatus(): Promise<{ isAuthenticated: boolean; expiresOn?: Date; scopes?: string[] }> {
    if (!this.credential) return { isAuthenticated: false };
    try {
      const token = await this.credential.getToken("https://graph.microsoft.com/.default");
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

  async addPermissions(scopes: string[]): Promise<void> {
    const { tenantId, clientId } = this.config;
    const redirectUri = this.config.redirectUri || DefaultRedirectUri;
    const scopeString = scopes.map((s) => `https://graph.microsoft.com/${s}`).join(" ");

    logger.info(`Requesting additional permissions: ${scopeString}`);

    this.credential = new InteractiveBrowserCredential({ tenantId, clientId, redirectUri });
    await this.credential.getToken(scopeString);
    logger.info("Additional permissions granted");
  }
}
