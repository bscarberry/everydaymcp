import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@microsoft/microsoft-graph-client";
import { logger } from "./logger.js";
import { getDefaultGraphApiVersion } from "./constants.js";
import { executeGraphGet } from "./graph-utils.js";

export function registerDefenderTools(
  server: McpServer,
  getGraphClient: () => Client | null,
) {
  const defaultVersion = getDefaultGraphApiVersion();

  // ── Defender query (GET) ───────────────────────────────────────────

  server.tool(
    "defender-query",
    `Query Microsoft Defender XDR via the Graph Security API. Read-only.

Supports: alerts, incidents, secure scores, threat intelligence, and
vulnerability management.

Common paths:
  /security/alerts_v2                           — Security alerts (v2)
  /security/incidents                           — Security incidents
  /security/secureScores                        — Secure scores over time
  /security/threatIntelligence/hosts            — Threat intelligence hosts
  /security/threatIntelligence/articles         — Threat intelligence articles
  /security/threatIntelligence/vulnerabilities  — Known vulnerabilities`,
    {
      path: z.string().describe(
        "Graph Security API path (e.g. '/security/alerts_v2', " +
        "'/security/incidents', '/security/secureScores', " +
        "'/security/threatIntelligence/hosts/{hostId}')",
      ),
      queryParams: z.record(z.string()).optional().describe(
        "OData query parameters (e.g. { '$filter': \"severity eq 'high'\", " +
        "'$top': '25', '$orderby': 'createdDateTime desc' })",
      ),
      graphApiVersion: z.enum(["v1.0", "beta"]).optional()
        .default(defaultVersion as "v1.0" | "beta")
        .describe(`Graph API version (default: ${defaultVersion})`),
      fetchAll: z.boolean().optional().default(false)
        .describe("Automatically page through all results"),
      consistencyLevel: z.string().optional()
        .describe("Set to 'eventual' for advanced queries"),
    },
    async ({ path, queryParams, graphApiVersion, fetchAll, consistencyLevel }) => {
      return executeGraphGet(
        "defender-query", path, queryParams,
        graphApiVersion, fetchAll, consistencyLevel, getGraphClient(),
      );
    },
  );

  // ── Defender XDR Advanced Hunting (POST with KQL) ──────────────────

  server.tool(
    "defender-advanced-hunting",
    `Run a KQL (Kusto Query Language) query using Microsoft Defender XDR
Advanced Hunting. This is a powerful endpoint for threat hunting across
your entire Defender XDR dataset.

Requires the ThreatHunting.Read.All permission.

Available tables include:
  DeviceEvents, DeviceProcessEvents, DeviceNetworkEvents,
  DeviceFileEvents, DeviceRegistryEvents, DeviceLogonEvents,
  DeviceImageLoadEvents, DeviceFileCertificateInfo,
  EmailEvents, EmailAttachmentInfo, EmailUrlInfo, EmailPostDeliveryEvents,
  IdentityLogonEvents, IdentityQueryEvents, IdentityDirectoryEvents,
  CloudAppEvents, AlertInfo, AlertEvidence,
  UrlClickEvents, AADSignInEventsBeta, AADSpnSignInEventsBeta

Example queries:
  "DeviceProcessEvents | where Timestamp > ago(1d) | take 10"
  "AlertInfo | where Severity == 'High' | summarize count() by Title"
  "IdentityLogonEvents | where Timestamp > ago(7d) | where ActionType == 'LogonFailed' | summarize count() by AccountName"`,
    {
      query: z.string().describe(
        "KQL query to execute (e.g. \"DeviceProcessEvents | where Timestamp > ago(1d) | take 10\")",
      ),
      graphApiVersion: z.enum(["v1.0", "beta"]).optional()
        .default("v1.0")
        .describe("Graph API version (default: v1.0)"),
    },
    async ({ query, graphApiVersion }) => {
      const graphClient = getGraphClient();
      if (!graphClient) {
        return {
          content: [{ type: "text" as const, text: "Graph client not initialized. Authentication may have failed." }],
          isError: true,
        };
      }

      logger.info(`defender-advanced-hunting: running KQL query (version=${graphApiVersion})`);

      try {
        const result = await graphClient
          .api("/security/runHuntingQuery")
          .version(graphApiVersion)
          .post({ Query: query });

        let text = `Advanced Hunting results (${graphApiVersion}):\n\n`;
        text += JSON.stringify(result, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        logger.error("defender-advanced-hunting error:", error);
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
    },
  );
}
