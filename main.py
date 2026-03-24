"""EverydayMCP server entry point.

Auth flow with APIM:
  1. MCP client obtains an OAuth token from Entra ID for the APIM resource.
  2. Client sends request to APIM with: Authorization: Bearer <user-token>
  3. APIM validates the token, then forwards the full request to this Function.
  4. APIMAuthMiddleware extracts the Bearer token and stores it in the
     `current_user_token` context variable (scoped to each async request).
  5. AuthManager reads the context variable; if present it performs an OBO
     exchange (CLIENT_ID + CLIENT_SECRET required) to obtain a Graph token
     on behalf of the user.  Falls back to Managed Identity otherwise.
"""

import logging
import os
import sys

import uvicorn
from mcp.server.fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from auth import AuthManager, current_user_token
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

# ── Auth manager ──────────────────────────────────────────────────────
auth_manager = AuthManager(tenant_id)

# ── MCP server ────────────────────────────────────────────────────────
mcp = FastMCP("EverydayMCP", stateless_http=True)

register_graph_tools(mcp, auth_manager)
register_weather_tools(mcp)


# ── APIM auth middleware ──────────────────────────────────────────────

class APIMAuthMiddleware(BaseHTTPMiddleware):
    """Extract the Bearer token forwarded by APIM and store it per-request.

    APIM validates the token before forwarding, so no re-validation is
    needed here.  The token is placed in `current_user_token` so that
    AuthManager can perform an OBO exchange for Graph API calls.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            current_user_token.set(token)
            logger.debug("APIMAuthMiddleware: user token captured for OBO")
        return await call_next(request)


# ── Wire up Starlette app with middleware ─────────────────────────────

def build_app() -> ASGIApp:
    starlette_app = mcp.streamable_http_app()
    starlette_app.add_middleware(APIMAuthMiddleware)
    return starlette_app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))
    logger.info(f"Starting EverydayMCP server v1.0.0 on port {port}")
    uvicorn.run(build_app(), host="0.0.0.0", port=port)
