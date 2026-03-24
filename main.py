import logging
import os
import sys

from mcp.server.fastmcp import FastMCP

from auth import AuthManager
from graph import register_graph_tools
from weather import register_weather_tools

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("everydaymcp")

# ── Validate required env vars ────────────────────────────────────────
tenant_id = os.environ.get("TENANT_ID")
if not tenant_id:
    logger.error(
        "Missing required environment variable: TENANT_ID. "
        "Set this in your Azure Function app configuration."
    )
    sys.exit(1)

# ── Auth (Managed Identity in Azure, Azure CLI locally) ──────────────
auth_manager = AuthManager(tenant_id)

# ── MCP server (stateless streamable-HTTP for Azure Functions) ────────
mcp = FastMCP("EverydayMCP", stateless_http=True)

register_graph_tools(mcp, auth_manager)
register_weather_tools(mcp)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    logger.info(f"Starting EverydayMCP server v1.0.0 on port {port}")
    mcp.run(transport="streamable-http", host="0.0.0.0", port=port)
