import json
import logging
from typing import Annotated, Optional

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import Field

from auth import AuthManager
from constants import get_default_graph_api_version

logger = logging.getLogger("everydaymcp")


async def execute_graph_get(
    tool_name: str,
    auth_manager: AuthManager,
    path: str,
    query_params: dict[str, str] | None,
    api_version: str,
    fetch_all: bool,
    consistency_level: str | None,
) -> str:
    logger.info(
        f"{tool_name}: GET {path} (version={api_version}, fetchAll={fetch_all})"
    )

    try:
        token = await auth_manager.get_access_token()
        url = f"https://graph.microsoft.com/{api_version}{path}"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if consistency_level:
            headers["ConsistencyLevel"] = consistency_level

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                url, params=query_params or {}, headers=headers
            )
            response.raise_for_status()
            data = response.json()

            if fetch_all and "value" in data:
                all_items = list(data["value"])
                next_link = data.get("@odata.nextLink")
                while next_link:
                    resp = await client.get(next_link, headers=headers)
                    resp.raise_for_status()
                    page = resp.json()
                    all_items.extend(page.get("value", []))
                    next_link = page.get("@odata.nextLink")
                data = {
                    "@odata.context": data.get("@odata.context"),
                    "value": all_items,
                }
                logger.info(
                    f"{tool_name}: fetched all pages, total items: {len(all_items)}"
                )

            text = f"Result for {tool_name} ({api_version}) - GET {path}:\n\n"
            text += json.dumps(data, indent=2, default=str)

            if not fetch_all and data.get("@odata.nextLink"):
                text += (
                    "\n\nNote: More results available. "
                    "Set fetch_all to true to retrieve all pages."
                )

            return text

    except httpx.HTTPStatusError as e:
        logger.error(f"{tool_name} error (path={path}): {e}")
        return json.dumps(
            {
                "error": str(e),
                "statusCode": e.response.status_code,
                "body": e.response.text,
            }
        )
    except Exception as e:
        logger.error(f"{tool_name} error (path={path}): {e}")
        return json.dumps({"error": str(e)})


def register_graph_tools(mcp: FastMCP, auth_manager: AuthManager) -> None:
    default_version = get_default_graph_api_version()

    @mcp.tool(
        name="entra-query",
        description=(
            "Query Microsoft Entra ID (Azure AD) via the Graph API. Read-only. "
            "Supports users, groups, service principals, app registrations, roles, "
            "conditional access policies, domains, and more. For advanced queries "
            "using $filter/$count/$search/$orderby, set consistency_level to 'eventual'."
        ),
    )
    async def entra_query(
        path: Annotated[
            str,
            Field(
                description=(
                    "Graph API path (e.g. '/users', '/groups', "
                    "'/servicePrincipals', '/applications', '/directoryRoles', "
                    "'/identity/conditionalAccess/policies', '/domains')"
                )
            ),
        ],
        query_params: Annotated[
            Optional[dict[str, str]],
            Field(
                description=(
                    "OData query parameters (e.g. {'$filter': \"displayName eq "
                    "'John'\", '$select': 'id,displayName', '$top': '10', "
                    "'$count': 'true'})"
                )
            ),
        ] = None,
        graph_api_version: Annotated[
            str,
            Field(description=f"Graph API version (default: {default_version})"),
        ] = default_version,
        fetch_all: Annotated[
            bool,
            Field(description="Automatically page through all results"),
        ] = False,
        consistency_level: Annotated[
            Optional[str],
            Field(
                description=(
                    "Set to 'eventual' for advanced queries using "
                    "$filter, $count, $search, $orderby"
                )
            ),
        ] = None,
    ) -> str:
        return await execute_graph_get(
            "entra-query",
            auth_manager,
            path,
            query_params,
            graph_api_version,
            fetch_all,
            consistency_level,
        )

    @mcp.tool(
        name="defender-query",
        description=(
            "Query Microsoft Defender via the Graph Security API. Read-only. "
            "Supports alerts, incidents, secure score, threat intelligence, "
            "vulnerabilities, and advanced hunting. Common paths: "
            "'/security/alerts_v2', '/security/incidents', "
            "'/security/secureScores', '/security/threatIntelligence/hosts', "
            "'/security/microsoft/evaluations'."
        ),
    )
    async def defender_query(
        path: Annotated[
            str,
            Field(
                description=(
                    "Graph Security API path (e.g. '/security/alerts_v2', "
                    "'/security/incidents', '/security/secureScores', "
                    "'/security/threatIntelligence/hosts/{hostId}')"
                )
            ),
        ],
        query_params: Annotated[
            Optional[dict[str, str]],
            Field(
                description=(
                    "OData query parameters (e.g. {'$filter': \"severity eq "
                    "'high'\", '$top': '25', '$orderby': 'createdDateTime desc'})"
                )
            ),
        ] = None,
        graph_api_version: Annotated[
            str,
            Field(description=f"Graph API version (default: {default_version})"),
        ] = default_version,
        fetch_all: Annotated[
            bool,
            Field(description="Automatically page through all results"),
        ] = False,
        consistency_level: Annotated[
            Optional[str],
            Field(description="Set to 'eventual' for advanced queries"),
        ] = None,
    ) -> str:
        return await execute_graph_get(
            "defender-query",
            auth_manager,
            path,
            query_params,
            graph_api_version,
            fetch_all,
            consistency_level,
        )

    @mcp.tool(
        name="intune-query",
        description=(
            "Query Microsoft Intune via the Graph API. Read-only. Supports "
            "managed devices, device compliance, configuration profiles, apps, "
            "and enrollment. Common paths: '/deviceManagement/managedDevices', "
            "'/deviceManagement/deviceCompliancePolicies', "
            "'/deviceManagement/deviceConfigurations', "
            "'/deviceAppManagement/mobileApps'."
        ),
    )
    async def intune_query(
        path: Annotated[
            str,
            Field(
                description=(
                    "Graph Intune API path (e.g. "
                    "'/deviceManagement/managedDevices', "
                    "'/deviceManagement/deviceCompliancePolicies', "
                    "'/deviceManagement/deviceConfigurations', "
                    "'/deviceAppManagement/mobileApps', "
                    "'/deviceManagement/windowsAutopilotDeviceIdentities')"
                )
            ),
        ],
        query_params: Annotated[
            Optional[dict[str, str]],
            Field(
                description=(
                    "OData query parameters (e.g. {'$filter': \"operatingSystem "
                    "eq 'Windows'\", '$select': 'id,deviceName,complianceState', "
                    "'$top': '50'})"
                )
            ),
        ] = None,
        graph_api_version: Annotated[
            str,
            Field(description=f"Graph API version (default: {default_version})"),
        ] = default_version,
        fetch_all: Annotated[
            bool,
            Field(description="Automatically page through all results"),
        ] = False,
        consistency_level: Annotated[
            Optional[str],
            Field(description="Set to 'eventual' for advanced queries"),
        ] = None,
    ) -> str:
        return await execute_graph_get(
            "intune-query",
            auth_manager,
            path,
            query_params,
            graph_api_version,
            fetch_all,
            consistency_level,
        )

    @mcp.tool(
        name="get-auth-status",
        description=(
            "Check the current authentication status, token expiration, "
            "and granted Graph permission scopes."
        ),
    )
    async def get_auth_status() -> str:
        status = await auth_manager.get_token_status()
        return json.dumps(
            {
                "isReady": True,
                "mode": "DefaultAzureCredential",
                "tokenStatus": status,
            },
            indent=2,
            default=str,
        )
