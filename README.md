# EverydayMCP

An MCP (Model Context Protocol) server that provides read-only access to:

- **Microsoft Entra ID** (Azure AD) — users, groups, service principals, conditional access, etc.
- **Microsoft Defender** — security alerts, incidents, secure scores, threat intelligence
- **Microsoft Intune** — managed devices, compliance policies, device configurations, apps
- **Weather** — current conditions, forecasts, astronomy data via [weatherapi.com](https://www.weatherapi.com/)

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Git](https://git-scm.com/)
- A Microsoft Entra (Azure AD) tenant with an app registration (see step 1 below)
- A [weatherapi.com](https://www.weatherapi.com/) API key (free tier available)

## Getting Started

### 1. Create an Entra App Registration

The server authenticates to Microsoft Graph as **your user account** via MSAL interactive sign-in. You need an app registration in your own Entra tenant to enable this.

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Navigate to **Identity** > **Applications** > **App registrations** > **New registration**
3. Fill in the registration form:
   - **Name**: `EverydayMCP` (or any name you prefer)
   - **Supported account types**: *Accounts in this organizational directory only* (single tenant)
   - **Redirect URI**: Select **Single-page application (SPA)** and enter `http://localhost:3000`
4. Click **Register**
5. On the app's **Overview** page, copy these two values — you will need them later:
   - **Application (client) ID** → this is your `CLIENT_ID`
   - **Directory (tenant) ID** → this is your `TENANT_ID`
6. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions** and add the permissions you need:

   | Service | Permissions |
   |---|---|
   | Entra ID | `User.Read`, `User.Read.All`, `Group.Read.All`, `Directory.Read.All`, `Policy.Read.All` |
   | Defender | `SecurityEvents.Read.All`, `SecurityIncident.Read.All`, `ThreatHunting.Read.All` |
   | Intune | `DeviceManagementManagedDevices.Read.All`, `DeviceManagementConfiguration.Read.All`, `DeviceManagementApps.Read.All` |

   > **Tip**: Start with `User.Read` to verify auth works, then add more permissions as needed. If you add new permissions later, re-run `npm run login` to pick them up.

7. If your organization requires it, click **Grant admin consent** for the permissions above

### 2. Clone the repository

```bash
git clone https://github.com/bscarberry/everydaymcp.git
cd everydaymcp
```

### 3. Install dependencies

```bash
npm install
```

### 4. Build

```bash
npm run build
```

This compiles the TypeScript source in `src/` to JavaScript in the `build/` directory.

### 5. Log in (one-time)

Before the MCP server can use Graph APIs, you must sign in once from your terminal. This opens a browser window, authenticates you, and caches the token locally so the MCP server can use it silently.

**Windows (PowerShell):**

```powershell
$env:TENANT_ID="your-tenant-id"; $env:CLIENT_ID="your-client-id"; npm run login
```

**macOS / Linux:**

```bash
TENANT_ID="your-tenant-id" CLIENT_ID="your-client-id" npm run login
```

A browser window will open for Microsoft sign-in. After you authenticate, the token is cached to `~/.everydaymcp/auth-record.json` and the OS credential store. You only need to do this once (or again if your token expires or you change permissions).

### 6. Configure your MCP client

See the [MCP Client Configuration](#mcp-client-configuration) section below.

## Configuration

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | **Yes** | Your Entra directory (tenant) ID — from step 1.5 above |
| `CLIENT_ID` | **Yes** | Your Entra app registration (client) ID — from step 1.5 above |
| `REDIRECT_URI` | No | OAuth redirect URI (defaults to `http://localhost:3000`) |
| `WEATHER_API_KEY` | Yes* | weatherapi.com API key (*only required for weather tools) |
| `USE_GRAPH_BETA` | No | Set to `false` to use Graph v1.0 instead of beta |

### Authentication

The server uses a **two-step authentication** approach:

1. **`npm run login`** — Run once in your terminal. Opens a browser for interactive Microsoft sign-in, then caches the token to disk and the OS credential store.
2. **MCP server** — On startup, loads the cached credential and acquires tokens **silently** (no browser, no prompts). The server never opens a browser or asks for a device code.

Your user account's permissions determine what Graph data is accessible. The server will exit with an error at startup if `TENANT_ID` or `CLIENT_ID` are not set.

> **Re-authentication**: If your cached token expires or you add new permissions to the app registration, simply re-run `npm run login`.

## MCP Client Configuration

### Claude Desktop

Add the following to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Windows example:**

```json
{
  "mcpServers": {
    "everydaymcp": {
      "command": "node",
      "args": ["C:/Users/YourName/everydaymcp/build/main.js"],
      "env": {
        "TENANT_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "CLIENT_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "WEATHER_API_KEY": "your-weatherapi-key"
      }
    }
  }
}
```

**macOS example:**

```json
{
  "mcpServers": {
    "everydaymcp": {
      "command": "node",
      "args": ["/Users/YourName/everydaymcp/build/main.js"],
      "env": {
        "TENANT_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "CLIENT_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "WEATHER_API_KEY": "your-weatherapi-key"
      }
    }
  }
}
```

> **Important:** The path must point to `build/main.js` (not `main.js`). Use forward slashes in the path even on Windows — Node.js handles them correctly.

Replace the `TENANT_ID` and `CLIENT_ID` values with the IDs you copied from your Entra app registration in step 1.

## Available Tools

### Graph API (Entra, Defender, Intune)

| Tool | Description |
|---|---|
| `entra-query` | Query Entra ID — users, groups, apps, roles, conditional access |
| `defender-query` | Query Defender — alerts, incidents, secure scores, threat intel |
| `intune-query` | Query Intune — managed devices, compliance, configs, apps |
| `get-auth-status` | Check auth status, token expiry, and granted scopes |

### Weather

| Tool | Description |
|---|---|
| `weather-current` | Current weather conditions for a location |
| `weather-forecast` | Weather forecast (up to 10 days) |
| `weather-search` | Search / autocomplete locations |
| `weather-astronomy` | Sunrise, sunset, moon phase data |

## Troubleshooting

### "No cached login found" error
Run `npm run login` in your terminal first, then restart the MCP server.

### Token expired
Re-run `npm run login` to refresh the cached token.

### Permission denied errors from Graph API
Add the required permissions to your app registration in Entra (step 1.6), grant admin consent if needed, then re-run `npm run login`.

### Server log location
The server writes logs to `build/mcp-server.log` in the project directory.

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
