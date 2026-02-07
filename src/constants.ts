// Shared constants for the EverydayMCP Server

// Default Azure AD app registration client ID for interactive auth
// Users should register their own app and override via CLIENT_ID env var
export const DefaultClientId = "a9bac4c3-af0d-4292-9453-9da89e390140";
export const DefaultTenantId = "common";
export const DefaultRedirectUri = "http://localhost:3000";

// Graph API version based on USE_GRAPH_BETA environment variable
export const getDefaultGraphApiVersion = (): "v1.0" | "beta" => {
  return process.env.USE_GRAPH_BETA !== "false" ? "beta" : "v1.0";
};
