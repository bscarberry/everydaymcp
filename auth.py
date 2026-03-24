import logging
from datetime import datetime, timezone

import jwt
from azure.identity.aio import DefaultAzureCredential

logger = logging.getLogger("everydaymcp")


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


class AuthManager:
    """Wraps DefaultAzureCredential for Graph API token acquisition.

    In Azure Functions this uses the app's Managed Identity automatically.
    In local development it falls through to Azure CLI / VS Code credentials.
    """

    def __init__(self, tenant_id: str) -> None:
        self.credential = DefaultAzureCredential(tenant_id=tenant_id)
        logger.info("AuthManager initialized with DefaultAzureCredential")

    async def get_access_token(self) -> str:
        token = await self.credential.get_token(
            "https://graph.microsoft.com/.default"
        )
        if not token:
            raise RuntimeError("Failed to acquire access token")
        return token.token

    async def get_token_status(self) -> dict:
        try:
            token = await self.credential.get_token(
                "https://graph.microsoft.com/.default"
            )
            if token:
                return {
                    "isAuthenticated": True,
                    "expiresOn": datetime.fromtimestamp(
                        token.expires_on, tz=timezone.utc
                    ).isoformat(),
                    "scopes": parse_jwt_scopes(token.token),
                }
        except Exception as e:
            logger.error(f"Error getting token status: {e}")
        return {"isAuthenticated": False}

    async def close(self) -> None:
        await self.credential.close()
