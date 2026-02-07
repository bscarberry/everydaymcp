import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { logger } from "./logger.js";

const WEATHER_API_BASE = "https://api.weatherapi.com/v1";

export function registerWeatherTools(server: McpServer) {
  const apiKey = process.env.WEATHER_API_KEY;

  // ── Current weather ────────────────────────────────────────────────
  server.tool(
    "weather-current",
    "Get current weather conditions for a location. Requires WEATHER_API_KEY env var. Location can be a city name, ZIP/postal code, IP address, or lat,lon coordinates.",
    {
      location: z.string().describe("Location query — city name (e.g. 'London'), US/UK/Canada postal code (e.g. '10001'), IP address, or 'lat,lon' (e.g. '48.8567,2.3508')"),
      aqi: z.boolean().optional().default(false).describe("Include air quality data"),
    },
    async ({ location, aqi }) => {
      return fetchWeather("/current.json", { q: location, aqi: aqi ? "yes" : "no" }, apiKey);
    },
  );

  // ── Weather forecast ───────────────────────────────────────────────
  server.tool(
    "weather-forecast",
    "Get weather forecast for a location (up to 10 days on paid plans, 3 days on free). Requires WEATHER_API_KEY env var.",
    {
      location: z.string().describe("Location query — city name, postal code, IP, or lat,lon"),
      days: z.number().min(1).max(10).optional().default(3).describe("Number of forecast days (1-10, free plan limited to 3)"),
      aqi: z.boolean().optional().default(false).describe("Include air quality data"),
      alerts: z.boolean().optional().default(false).describe("Include weather alerts"),
    },
    async ({ location, days, aqi, alerts }) => {
      return fetchWeather("/forecast.json", {
        q: location,
        days: String(days),
        aqi: aqi ? "yes" : "no",
        alerts: alerts ? "yes" : "no",
      }, apiKey);
    },
  );

  // ── Location search / autocomplete ─────────────────────────────────
  server.tool(
    "weather-search",
    "Search for locations matching a query. Returns matching city/region results. Useful for disambiguating location names. Requires WEATHER_API_KEY env var.",
    {
      query: z.string().describe("Location search query (partial city name, postal code, etc.)"),
    },
    async ({ query }) => {
      return fetchWeather("/search.json", { q: query }, apiKey);
    },
  );

  // ── Astronomy ──────────────────────────────────────────────────────
  server.tool(
    "weather-astronomy",
    "Get astronomy data (sunrise, sunset, moonrise, moonset, moon phase) for a location and date. Requires WEATHER_API_KEY env var.",
    {
      location: z.string().describe("Location query — city name, postal code, IP, or lat,lon"),
      date: z.string().optional().describe("Date in YYYY-MM-DD format (defaults to today)"),
    },
    async ({ location, date }) => {
      const params: Record<string, string> = { q: location };
      if (date) params.dt = date;
      return fetchWeather("/astronomy.json", params, apiKey);
    },
  );
}

// ── Shared fetch helper ────────────────────────────────────────────────
async function fetchWeather(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string | undefined,
) {
  if (!apiKey) {
    return {
      content: [{ type: "text" as const, text: "WEATHER_API_KEY environment variable is not set. Get a free key at https://www.weatherapi.com/" }],
      isError: true,
    };
  }

  const url = new URL(`${WEATHER_API_BASE}${endpoint}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  logger.info(`weather: GET ${endpoint} (${params.q || ""})`);

  try {
    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok) {
      const errMsg = (data as any)?.error?.message || JSON.stringify(data);
      logger.error(`weather API error (${response.status}): ${errMsg}`);
      return {
        content: [{ type: "text" as const, text: `Weather API error (${response.status}): ${errMsg}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  } catch (error: any) {
    logger.error(`weather fetch error (${endpoint}):`, error);
    return {
      content: [{ type: "text" as const, text: `Weather fetch error: ${error.message}` }],
      isError: true,
    };
  }
}
