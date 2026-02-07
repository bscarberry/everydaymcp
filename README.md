# EverydayMCP

An MCP (Model Context Protocol) server that provides read-only access to:

- **Microsoft Entra ID** (Azure AD) — users, groups, service principals, conditional access, etc.
- **Microsoft Defender** — security alerts, incidents, secure scores, threat intelligence
- **Microsoft Intune** — managed devices, compliance policies, device configurations, apps
- **Weather** — current conditions, forecasts, astronomy data via [weatherapi.com](https://www.weatherapi.com/)

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Git](https://git-scm.com/)
- A Microsoft Entra app registration (or use the built-in default client ID)
- A [weatherapi.com](https://www.weatherapi.com/) API key (free tier available)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/bscarberry/everydaymcp.git
cd everydaymcp
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build

```bash
npm run build
```

This compiles the TypeScript source in `src/` to JavaScript in the `build/` directory.

### 4. Run

```bash
npm start
```

On first run the server will prompt you to sign in to your Microsoft account (via browser or device-code flow).

## Configuration

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | No | Azure AD tenant ID (defaults to `common`) |
| `CLIENT_ID` | No | App registration client ID (has a built-in default) |
| `REDIRECT_URI` | No | OAuth redirect URI (defaults to `http://localhost:3000`) |
| `WEATHER_API_KEY` | Yes* | weatherapi.com API key (*required for weather tools) |
| `USE_GRAPH_BETA` | No | Set to `false` to use Graph v1.0 instead of beta |

### Authentication

The server uses **interactive user authentication** (MSAL). On startup it will:

1. Attempt to open a browser for interactive sign-in
2. Fall back to device-code flow if a browser is unavailable

Your user account's permissions determine what Graph data is accessible.

### Azure AD App Registration

To use your own app registration:

1. Go to [Entra admin center](https://entra.microsoft.com/) > App registrations > New registration
2. Set redirect URI to `http://localhost:3000` (Single-page application)
3. Under API permissions, add Microsoft Graph delegated permissions as needed:
   - `User.Read.All`, `Group.Read.All` (Entra)
   - `SecurityEvents.Read.All` (Defender)
   - `DeviceManagementManagedDevices.Read.All` (Intune)
4. Set `CLIENT_ID` to your app's Application (client) ID

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "everydaymcp": {
      "command": "node",
      "args": ["/absolute/path/to/everydaymcp/build/main.js"],
      "env": {
        "WEATHER_API_KEY": "your-weatherapi-key",
        "TENANT_ID": "your-tenant-id",
        "CLIENT_ID": "your-client-id"
      }
    }
  }
}
```

## Available Tools

### Graph API (Entra, Defender, Intune)

| Tool | Description |
|---|---|
| `entra-query` | Query Entra ID — users, groups, apps, roles, conditional access |
| `defender-query` | Query Defender — alerts, incidents, secure scores, threat intel |
| `intune-query` | Query Intune — managed devices, compliance, configs, apps |
| `get-auth-status` | Check auth status, token expiry, and granted scopes |
| `add-graph-permission` | Request additional Graph permission scopes |

### Weather

| Tool | Description |
|---|---|
| `weather-current` | Current weather conditions for a location |
| `weather-forecast` | Weather forecast (up to 10 days) |
| `weather-search` | Search / autocomplete locations |
| `weather-astronomy` | Sunrise, sunset, moon phase data |

## Example Queries

```
# Entra: list all users
entra-query { path: "/users" }

# Defender: high severity alerts
defender-query { path: "/security/alerts_v2", queryParams: { "$filter": "severity eq 'high'" } }

# Intune: all managed devices
intune-query { path: "/deviceManagement/managedDevices", fetchAll: true }

# Weather: current conditions
weather-current { location: "Seattle" }

# Weather: 5-day forecast with alerts
weather-forecast { location: "New York", days: 5, alerts: true }
```
