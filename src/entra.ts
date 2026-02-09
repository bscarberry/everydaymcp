import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@microsoft/microsoft-graph-client";
import { getDefaultGraphApiVersion } from "./constants.js";
import { executeGraphGet } from "./graph-utils.js";

export function registerEntraTools(
  server: McpServer,
  getGraphClient: () => Client | null,
) {
  const defaultVersion = getDefaultGraphApiVersion();

  server.tool(
    "entra-query",
    `Query Microsoft Entra ID (Azure AD) via the Graph API. Read-only.

Supports: users, groups, service principals, app registrations, directory roles,
conditional access policies, domains, sign-in logs, audit logs, and more.

Common paths:
  /users                                        — List users
  /groups                                       — List groups
  /servicePrincipals                            — List service principals
  /applications                                 — List app registrations
  /directoryRoles                               — List activated directory roles
  /identity/conditionalAccess/policies          — Conditional access policies
  /domains                                      — Tenant domains
  /auditLogs/signIns                            — Sign-in logs (requires AuditLog.Read.All)
  /auditLogs/directoryAudits                    — Directory audit logs

For advanced queries using $filter/$count/$search/$orderby, set consistencyLevel to 'eventual'.`,
    {
      path: z.string().describe(
        "Graph API path (e.g. '/users', '/groups', '/servicePrincipals', " +
        "'/applications', '/directoryRoles', " +
        "'/identity/conditionalAccess/policies', '/domains', " +
        "'/auditLogs/signIns', '/auditLogs/directoryAudits')",
      ),
      queryParams: z.record(z.string()).optional().describe(
        "OData query parameters (e.g. { '$filter': \"displayName eq 'John'\", " +
        "'$select': 'id,displayName', '$top': '10', '$count': 'true' })",
      ),
      graphApiVersion: z.enum(["v1.0", "beta"]).optional()
        .default(defaultVersion as "v1.0" | "beta")
        .describe(`Graph API version (default: ${defaultVersion})`),
      fetchAll: z.boolean().optional().default(false)
        .describe("Automatically page through all results"),
      consistencyLevel: z.string().optional()
        .describe("Set to 'eventual' for advanced queries using $filter, $count, $search, $orderby"),
    },
    async ({ path, queryParams, graphApiVersion, fetchAll, consistencyLevel }) => {
      return executeGraphGet(
        "entra-query", path, queryParams,
        graphApiVersion, fetchAll, consistencyLevel, getGraphClient(),
      );
    },
  );
}
