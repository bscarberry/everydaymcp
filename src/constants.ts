// Shared constants for the EverydayMCP Server

// Microsoft Graph API scopes — .default requests all consented permissions
export const GRAPH_SCOPES = ["https://graph.microsoft.com/.default"];

// Graph API version based on USE_GRAPH_BETA environment variable
export const getDefaultGraphApiVersion = (): "v1.0" | "beta" => {
  return process.env.USE_GRAPH_BETA !== "false" ? "beta" : "v1.0";
};
