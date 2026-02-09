// Shared constants for the EverydayMCP Server

// Default Entra app registration for zero-config interactive auth.
// To use this, register a multi-tenant app in Entra with:
//   - Supported account types: "Accounts in any organizational directory"
//   - Platform: "Mobile and desktop applications" with http://localhost
//   - "Allow public client flows" = Yes
// Then paste the Application (client) ID below.
export const DefaultClientId = "";
export const DefaultTenantId = "common";
export const DefaultRedirectUri = "http://localhost:3000";

// Microsoft Graph API scopes — .default requests all consented permissions
export const GRAPH_SCOPES = ["https://graph.microsoft.com/.default"];

// Graph API version based on USE_GRAPH_BETA environment variable
export const getDefaultGraphApiVersion = (): "v1.0" | "beta" => {
  return process.env.USE_GRAPH_BETA !== "false" ? "beta" : "v1.0";
};
