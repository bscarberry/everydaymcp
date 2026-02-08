import {
  AccessToken,
  TokenCredential,
  InteractiveBrowserCredential,
  DeviceCodeCredential,
  DeviceCodeInfo,
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

// Adapts Azure Identity credentials for the Graph SDK
export class TokenCredentialAuthProvider implements AuthenticationProvider {
  private credential: TokenCredential;

  constructor(credential: TokenCredential) {
    this.credential = credential;
  }

  async getAccessToken(): Promise<string> {
    const token = await this.credential.getToken("https://graph.microsoft.com/.default");
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
  private credential: TokenCredential | null = null;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const { tenantId, clientId } = this.config;
    const redirectUri = this.config.redirectUri || DefaultRedirectUri;

    logger.info(`Initializing interactive authentication (tenant: ${tenantId}, client: ${clientId})`);

    try {
      this.credential = new InteractiveBrowserCredential({
        tenantId,
        clientId,
        redirectUri,
      });

      // Test credential by acquiring a token
      const token = await this.credential.getToken("https://graph.microsoft.com/.default");
      if (!token) throw new Error("Failed to acquire token");
      logger.info("Interactive browser authentication successful");
    } catch (error) {
      logger.info("Interactive browser failed, falling back to device code flow");
      this.credential = new DeviceCodeCredential({
        tenantId,
        clientId,
        userPromptCallback: (info: DeviceCodeInfo) => {
          console.error(`\nAuthentication Required:`);
          console.error(`Visit: ${info.verificationUri}`);
          console.error(`Enter code: ${info.userCode}\n`);
          return Promise.resolve();
        },
      });

      const token = await this.credential.getToken("https://graph.microsoft.com/.default");
      if (!token) throw new Error("Failed to acquire token via device code");
      logger.info("Device code authentication successful");
    }
  }

  getGraphAuthProvider(): TokenCredentialAuthProvider {
    if (!this.credential) throw new Error("Authentication not initialized");
    return new TokenCredentialAuthProvider(this.credential);
  }

  getCredential(): TokenCredential {
    if (!this.credential) throw new Error("Authentication not initialized");
    return this.credential;
  }

  async getTokenStatus(): Promise<{ isExpired: boolean; expiresOn?: Date; scopes?: string[] }> {
    if (!this.credential) return { isExpired: true };
    try {
      const token = await this.credential.getToken("https://graph.microsoft.com/.default");
      if (token) {
        return {
          isExpired: false,
          expiresOn: new Date(token.expiresOnTimestamp),
          scopes: parseJwtScopes(token.token),
        };
      }
    } catch (error) {
      logger.error("Error getting token status", error);
    }
    return { isExpired: true };
  }

  async addPermissions(scopes: string[]): Promise<void> {
    const { tenantId, clientId } = this.config;
    const redirectUri = this.config.redirectUri || DefaultRedirectUri;
    const scopeString = scopes.map((s) => `https://graph.microsoft.com/${s}`).join(" ");

    logger.info(`Requesting additional permissions: ${scopeString}`);
    console.error(`\nRequesting Additional Graph Permissions: ${scopes.join(", ")}`);

    try {
      this.credential = new InteractiveBrowserCredential({ tenantId, clientId, redirectUri });
      await this.credential.getToken(scopeString);
    } catch {
      logger.info("Interactive browser failed, falling back to device code for permission request");
      this.credential = new DeviceCodeCredential({
        tenantId,
        clientId,
        userPromptCallback: (info: DeviceCodeInfo) => {
          console.error(`\nAdditional Permissions Required:`);
          console.error(`Visit: ${info.verificationUri}`);
          console.error(`Enter code: ${info.userCode}`);
          console.error(`Scopes: ${scopes.join(", ")}\n`);
          return Promise.resolve();
        },
      });
      await this.credential.getToken(scopeString);
    }
    logger.info("Additional permissions granted");
  }
}
