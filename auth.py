"""Authentication management for EverydayMCP.

Auth strategy (APIM + OBO):
  - APIM validates the incoming OAuth token from the MCP client.
  - The validated Bearer token is extracted from the Authorization header
    by APIMAuthMiddleware in main.py and stored in `current_user_token`.
  - When a user token is present AND CLIENT_ID / CLIENT_SECRET are configured,
    OnBehalfOfCredential performs an OBO exchange so Graph API is called on
    behalf of the signed-in user.
  - Falls back to DefaultAzureCredential (Managed Identity / Azure CLI) when
    CLIENT_ID or CLIENT_SECRET are absent, or when there is no user token
    (e.g. health-check / anonymous calls).
"""

import logging
import os
from contextvars import ContextVar
from datetime import datetime, timezone

import jwt
from azure.identity.aio import DefaultAzureCredential, OnBehalfOfCredential

logger = logging.getLogger("everydaymcp")

# Set by APIMAuthMiddleware for each inbound HTTP request.
current_user_token: ContextVar[str | None] = ContextVar(
    "current_user_token", default=None
)

GRAPH_SCOPE = "https://graph.microsoft.com/.default"


# ── Helpers ──────────────────────────────────────────────────────────

def parse_jwt_scopes(token: str) -> list[str]:
    try:
        decoded = jwt.decode(token, options={"verify_signature": False})
        if "scp" in decoded and isinstance(decoded["scp"], str):
            return [s for s in decoded["scp"].split() if s]
        if "roles" in decoded and isinstance(decoded["roles"], list):
            return decoded["roles"]
    except Exception:
        pass
    return []


# ── Auth manager ──────────────────────────────────────────────────────

class AuthManager:
    """Handles Graph API token acquisition with APIM OBO support.

    Token acquisition priority per-request:
      1. OBO  — user token is present in current_user_token context var
                AND CLIENT_ID + CLIENT_SECRET env vars are set.
      2. Fallback — DefaultAzureCredential (Managed Identity in Azure,
                    Azure CLI / VS Code locally).
    """

    def __init__(self, tenant_id: str) -> None:
        self.tenant_id = tenant_id
        self.client_id = os.environ.get("CLIENT_ID")
        self.client_secret = os.environ.get("CLIENT_SECRET")
        self._fallback = DefaultAzureCredential(tenant_id=tenant_id)

        if self.client_id and self.client_secret:
            logger.info(
                "AuthManager: OBO enabled (CLIENT_ID + CLIENT_SECRET present). "
                "Graph calls will be made on behalf of the authenticated user."
            )
        else:
            logger.info(
                "AuthManager: OBO disabled (CLIENT_ID / CLIENT_SECRET not set). "
                "Graph calls will use DefaultAzureCredential (Managed Identity)."
            )

    def _obo_available(self) -> bool:
        return bool(self.client_id and self.client_secret)

    async def get_access_token(self) -> str:
        user_token = current_user_token.get()

        if user_token and self._obo_available():
            # OBO: exchange the user's APIM-validated token for a Graph token.
            async with OnBehalfOfCredential(
                tenant_id=self.tenant_id,
                client_id=self.client_id,        # type: ignore[arg-type]
                client_secret=self.client_secret, # type: ignore[arg-type]
                user_assertion=user_token,
            ) as obo:
                token = await obo.get_token(GRAPH_SCOPE)
                if not token:
                    raise RuntimeError("OBO token exchange failed")
                return token.token

        # Fallback: Managed Identity (Azure) or Azure CLI (local).
        token = await self._fallback.get_token(GRAPH_SCOPE)
        if not token:
            raise RuntimeError("Failed to acquire access token")
        return token.token

    async def get_token_status(self) -> dict:
        try:
            token_str = await self.get_access_token()
            user_token = current_user_token.get()
            mode = (
                "OnBehalfOf"
                if (user_token and self._obo_available())
                else "DefaultAzureCredential"
            )
            decoded = jwt.decode(token_str, options={"verify_signature": False})
            exp = decoded.get("exp")
            return {
                "isAuthenticated": True,
                "mode": mode,
                "expiresOn": (
                    datetime.fromtimestamp(exp, tz=timezone.utc).isoformat()
                    if exp else None
                ),
                "scopes": parse_jwt_scopes(token_str),
            }
        except Exception as e:
            logger.error(f"Error getting token status: {e}")
        return {"isAuthenticated": False}

    async def close(self) -> None:
        await self._fallback.close()
