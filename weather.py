import json
import logging
import os
from typing import Annotated, Optional

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import Field

logger = logging.getLogger("everydaymcp")

WEATHER_API_BASE = "https://api.weatherapi.com/v1"


async def fetch_weather(
    endpoint: str, params: dict[str, str], api_key: str | None
) -> str:
    if not api_key:
        return (
            "WEATHER_API_KEY environment variable is not set. "
            "Get a free key at https://www.weatherapi.com/"
        )

    url = f"{WEATHER_API_BASE}{endpoint}"
    params["key"] = api_key

    logger.info(f"weather: GET {endpoint} ({params.get('q', '')})")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, params=params)
            data = response.json()

            if not response.is_success:
                err_msg = data.get("error", {}).get("message", json.dumps(data))
                logger.error(
                    f"weather API error ({response.status_code}): {err_msg}"
                )
                return f"Weather API error ({response.status_code}): {err_msg}"

            return json.dumps(data, indent=2)
    except Exception as e:
        logger.error(f"weather fetch error ({endpoint}): {e}")
        return f"Weather fetch error: {e}"


def register_weather_tools(mcp: FastMCP) -> None:
    api_key = os.environ.get("WEATHER_API_KEY")

    @mcp.tool(
        name="weather-current",
        description=(
            "Get current weather conditions for a location. Requires "
            "WEATHER_API_KEY env var. Location can be a city name, "
            "ZIP/postal code, IP address, or lat,lon coordinates."
        ),
    )
    async def weather_current(
        location: Annotated[
            str,
            Field(
                description=(
                    "Location query — city name (e.g. 'London'), "
                    "US/UK/Canada postal code (e.g. '10001'), IP address, "
                    "or 'lat,lon' (e.g. '48.8567,2.3508')"
                )
            ),
        ],
        aqi: Annotated[
            bool, Field(description="Include air quality data")
        ] = False,
    ) -> str:
        return await fetch_weather(
            "/current.json",
            {"q": location, "aqi": "yes" if aqi else "no"},
            api_key,
        )

    @mcp.tool(
        name="weather-forecast",
        description=(
            "Get weather forecast for a location (up to 10 days on paid "
            "plans, 3 days on free). Requires WEATHER_API_KEY env var."
        ),
    )
    async def weather_forecast(
        location: Annotated[
            str,
            Field(description="Location query — city name, postal code, IP, or lat,lon"),
        ],
        days: Annotated[
            int,
            Field(
                description="Number of forecast days (1-10, free plan limited to 3)",
                ge=1,
                le=10,
            ),
        ] = 3,
        aqi: Annotated[
            bool, Field(description="Include air quality data")
        ] = False,
        alerts: Annotated[
            bool, Field(description="Include weather alerts")
        ] = False,
    ) -> str:
        return await fetch_weather(
            "/forecast.json",
            {
                "q": location,
                "days": str(days),
                "aqi": "yes" if aqi else "no",
                "alerts": "yes" if alerts else "no",
            },
            api_key,
        )

    @mcp.tool(
        name="weather-search",
        description=(
            "Search for locations matching a query. Returns matching "
            "city/region results. Useful for disambiguating location names. "
            "Requires WEATHER_API_KEY env var."
        ),
    )
    async def weather_search(
        query: Annotated[
            str,
            Field(description="Location search query (partial city name, postal code, etc.)"),
        ],
    ) -> str:
        return await fetch_weather("/search.json", {"q": query}, api_key)

    @mcp.tool(
        name="weather-astronomy",
        description=(
            "Get astronomy data (sunrise, sunset, moonrise, moonset, moon "
            "phase) for a location and date. Requires WEATHER_API_KEY env var."
        ),
    )
    async def weather_astronomy(
        location: Annotated[
            str,
            Field(description="Location query — city name, postal code, IP, or lat,lon"),
        ],
        date: Annotated[
            Optional[str],
            Field(description="Date in YYYY-MM-DD format (defaults to today)"),
        ] = None,
    ) -> str:
        params: dict[str, str] = {"q": location}
        if date:
            params["dt"] = date
        return await fetch_weather("/astronomy.json", params, api_key)
