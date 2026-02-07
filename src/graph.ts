import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client, PageIterator, PageCollection } from "@microsoft/microsoft-graph-client";
import { logger } from "./logger.js";
import { AuthManager } from "./auth.js";
import { getDefaultGraphApiVersion } from "./constants.js";

export function registerGraphTools(server: McpServer, getGraphClient: () => Client | null, getAuthManager: () => AuthManager | null) {
  const defaultVersion = getDefaultGraphApiVersion();

  // ── Entra ID (Azure AD) ────────────────────────────────────────────
  server.tool(
    "entra-query",
    "Query Microsoft Entra ID (Azure AD) via the Graph API. Read-only. Supports users, groups, service principals, app registrations, roles, conditional access policies, domains, and more. For advanced queries using $filter/$count/$search/$orderby, set consistencyLevel to 'eventual'.",
    {
      path: z.string().describe("Graph API path (e.g. '/users', '/groups', '/servicePrincipals', '/applications', '/directoryRoles', '/identity/conditionalAccess/policies', '/domains')"),
      queryParams: z.record(z.string()).optional().describe("OData query parameters (e.g. { '$filter': \"displayName eq 'John'\", '$select': 'id,displayName', '$top': '10', '$count': 'true' })"),
      graphApiVersion: z.enum(["v1.0", "beta"]).optional().default(defaultVersion as "v1.0" | "beta").describe(`Graph API version (default: ${defaultVersion})`),
      fetchAll: z.boolean().optional().default(false).describe("Automatically page through all results"),
      consistencyLevel: z.string().optional().describe("Set to 'eventual' for advanced queries using $filter, $count, $search, $orderby"),
    },
    async ({ path, queryParams, graphApiVersion, fetchAll, consistencyLevel }) => {
      return executeGraphGet("entra-query", path, queryParams, graphApiVersion, fetchAll, consistencyLevel, getGraphClient());
    },
  );

  // ── Microsoft Defender ─────────────────────────────────────────────
  server.tool(
    "defender-query",
    "Query Microsoft Defender via the Graph Security API. Read-only. Supports alerts, incidents, secure score, threat intelligence, vulnerabilities, and advanced hunting. Common paths: '/security/alerts_v2', '/security/incidents', '/security/secureScores', '/security/threatIntelligence/hosts', '/security/microsoft/evaluations'.",
    {
      path: z.string().describe("Graph Security API path (e.g. '/security/alerts_v2', '/security/incidents', '/security/secureScores', '/security/threatIntelligence/hosts/{hostId}')"),
      queryParams: z.record(z.string()).optional().describe("OData query parameters (e.g. { '$filter': \"severity eq 'high'\", '$top': '25', '$orderby': 'createdDateTime desc' })"),
      graphApiVersion: z.enum(["v1.0", "beta"]).optional().default(defaultVersion as "v1.0" | "beta").describe(`Graph API version (default: ${defaultVersion})`),
      fetchAll: z.boolean().optional().default(false).describe("Automatically page through all results"),
      consistencyLevel: z.string().optional().describe("Set to 'eventual' for advanced queries"),
    },
    async ({ path, queryParams, graphApiVersion, fetchAll, consistencyLevel }) => {
      return executeGraphGet("defender-query", path, queryParams, graphApiVersion, fetchAll, consistencyLevel, getGraphClient());
    },
  );

  // ── Microsoft Intune ───────────────────────────────────────────────
  server.tool(
    "intune-query",
    "Query Microsoft Intune via the Graph API. Read-only. Supports managed devices, device compliance, configuration profiles, apps, and enrollment. Common paths: '/deviceManagement/managedDevices', '/deviceManagement/deviceCompliancePolicies', '/deviceManagement/deviceConfigurations', '/deviceAppManagement/mobileApps'.",
    {
      path: z.string().describe("Graph Intune API path (e.g. '/deviceManagement/managedDevices', '/deviceManagement/deviceCompliancePolicies', '/deviceManagement/deviceConfigurations', '/deviceAppManagement/mobileApps', '/deviceManagement/windowsAutopilotDeviceIdentities')"),
      queryParams: z.record(z.string()).optional().describe("OData query parameters (e.g. { '$filter': \"operatingSystem eq 'Windows'\", '$select': 'id,deviceName,complianceState', '$top': '50' })"),
      graphApiVersion: z.enum(["v1.0", "beta"]).optional().default(defaultVersion as "v1.0" | "beta").describe(`Graph API version (default: ${defaultVersion})`),
      fetchAll: z.boolean().optional().default(false).describe("Automatically page through all results"),
      consistencyLevel: z.string().optional().describe("Set to 'eventual' for advanced queries"),
    },
    async ({ path, queryParams, graphApiVersion, fetchAll, consistencyLevel }) => {
      return executeGraphGet("intune-query", path, queryParams, graphApiVersion, fetchAll, consistencyLevel, getGraphClient());
    },
  );

  // ── Auth status ────────────────────────────────────────────────────
  server.tool(
    "get-auth-status",
    "Check the current authentication status, token expiration, and granted Graph permission scopes.",
    {},
    async () => {
      const authManager = getAuthManager();
      if (!authManager) {
        return { content: [{ type: "text" as const, text: "Auth manager not initialized" }], isError: true };
      }
      const tokenStatus = await authManager.getTokenStatus();
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ isReady: true, mode: "interactive", tokenStatus, timestamp: new Date().toISOString() }, null, 2),
        }],
      };
    },
  );

  // ── Add permissions ────────────────────────────────────────────────
  server.tool(
    "add-graph-permission",
    "Request additional Microsoft Graph permission scopes via a fresh interactive sign-in. Use when a query returns a permissions error.",
    {
      scopes: z.array(z.string()).describe("Permission scopes to request (e.g. ['User.Read.All', 'SecurityEvents.Read.All', 'DeviceManagementManagedDevices.Read.All'])"),
    },
    async ({ scopes }) => {
      const authManager = getAuthManager();
      if (!authManager) {
        return { content: [{ type: "text" as const, text: "Auth manager not initialized" }], isError: true };
      }
      if (!scopes.length) {
        return { content: [{ type: "text" as const, text: "At least one scope is required" }], isError: true };
      }
      try {
        await authManager.addPermissions(scopes);
        const tokenStatus = await authManager.getTokenStatus();
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({ message: "Permissions granted successfully", requestedScopes: scopes, tokenStatus }, null, 2),
          }],
        };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    },
  );
}

// ── Shared GET executor ────────────────────────────────────────────────
async function executeGraphGet(
  toolName: string,
  path: string,
  queryParams: Record<string, string> | undefined,
  graphApiVersion: "v1.0" | "beta",
  fetchAll: boolean,
  consistencyLevel: string | undefined,
  graphClient: Client | null,
) {
  if (!graphClient) {
    return { content: [{ type: "text" as const, text: "Graph client not initialized. Authentication may have failed." }], isError: true };
  }

  logger.info(`${toolName}: GET ${path} (version=${graphApiVersion}, fetchAll=${fetchAll})`);

  try {
    let request = graphClient.api(path).version(graphApiVersion);

    if (queryParams && Object.keys(queryParams).length > 0) {
      request = request.query(queryParams);
    }
    if (consistencyLevel) {
      request = request.header("ConsistencyLevel", consistencyLevel);
    }

    let responseData: any;

    if (fetchAll) {
      const firstPage: PageCollection = await request.get();
      const context = firstPage["@odata.context"];
      const allItems: any[] = firstPage.value || [];
      const pageIterator = new PageIterator(graphClient, firstPage, (item: any) => {
        allItems.push(item);
        return true;
      });
      await pageIterator.iterate();
      responseData = { "@odata.context": context, value: allItems };
      logger.info(`${toolName}: fetched all pages, total items: ${allItems.length}`);
    } else {
      responseData = await request.get();
    }

    let text = `Result for ${toolName} (${graphApiVersion}) - GET ${path}:\n\n`;
    text += JSON.stringify(responseData, null, 2);

    if (!fetchAll && responseData?.["@odata.nextLink"]) {
      text += "\n\nNote: More results available. Set fetchAll to true to retrieve all pages.";
    }

    return { content: [{ type: "text" as const, text }] };
  } catch (error: any) {
    logger.error(`${toolName} error (path=${path}):`, error);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          error: error.message || String(error),
          statusCode: error.statusCode || "N/A",
          body: error.body ?? "N/A",
        }),
      }],
      isError: true,
    };
  }
}
