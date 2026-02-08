// Shared constants for the EverydayMCP Server

// No default client ID — users must register their own Entra app and
// provide CLIENT_ID and TENANT_ID via environment variables.
export const DefaultRedirectUri = "http://localhost:3000";

// Graph API version based on USE_GRAPH_BETA environment variable
export const getDefaultGraphApiVersion = (): "v1.0" | "beta" => {
  return process.env.USE_GRAPH_BETA !== "false" ? "beta" : "v1.0";
};
