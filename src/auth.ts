import { DefaultAzureCredential } from "@azure/identity";
import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import jwt from "jsonwebtoken";
import { logger } from "./logger.js";

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
  private credential: DefaultAzureCredential;

  constructor(credential: DefaultAzureCredential) {
    this.credential = credential;
  }

  async getAccessToken(): Promise<string> {
    const token = await this.credential.getToken("https://graph.microsoft.com/.default");
    if (!token) throw new Error("Failed to acquire access token");
    return token.token;
  }
}

// ── Auth config & manager ────────────────────────────────────────────

export interface AuthConfig {
  tenantId: string;
}

export class AuthManager {
  private credential: DefaultAzureCredential;

  constructor(config: AuthConfig) {
    // DefaultAzureCredential automatically uses:
    //   - Managed Identity when running in Azure Functions
    //   - Azure CLI / VS Code / environment credentials locally
    this.credential = new DefaultAzureCredential({ tenantId: config.tenantId });
    logger.info("AuthManager initialized with DefaultAzureCredential");
  }

  getGraphAuthProvider(): TokenCredentialAuthProvider {
    return new TokenCredentialAuthProvider(this.credential);
  }

  async getTokenStatus(): Promise<{
    isAuthenticated: boolean;
    expiresOn?: Date;
    scopes?: string[];
  }> {
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
