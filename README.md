# EverydayMCP

An MCP (Model Context Protocol) server that provides read-only access to:

- **Microsoft Entra ID** (Azure AD) — users, groups, service principals, conditional access, sign-in logs, audit logs
- **Microsoft Defender XDR** — security alerts, incidents, secure scores, threat intelligence, and **Advanced Hunting (KQL)**
- **Weather** — current conditions, forecasts, astronomy data via [weatherapi.com](https://www.weatherapi.com/)

Authentication uses **MSAL** (`@azure/msal-node`) with a file-based token cache for silent token acquisition.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Git](https://git-scm.com/)
- A Microsoft Entra (Azure AD) tenant with an app registration (see step 1 below)
- A [weatherapi.com](https://www.weatherapi.com/) API key (free tier available — only required for weather tools)

## Getting Started

### 1. Create an Entra App Registration

The server authenticates to Microsoft Graph as **your user account** via MSAL interactive sign-in. You need an app registration in your own Entra tenant to enable this.

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Navigate to **Identity** > **Applications** > **App registrations** > **New registration**
3. Fill in the registration form:
   - **Name**: `EverydayMCP` (or any name you prefer)
   - **Supported account types**: *Accounts in this organizational directory only* (single tenant)
   - **Redirect URI**: Leave blank for now (configured in the next step)
4. Click **Register**
5. On the app's **Overview** page, copy these two values — you will need them later:
   - **Application (client) ID** → this is your `CLIENT_ID`
   - **Directory (tenant) ID** → this is your `TENANT_ID`
6. Go to **Authentication** > **Add a platform** > **Mobile and desktop applications**
   - Check the `http://localhost` redirect URI
   - Click **Configure**
7. On the same **Authentication** page, scroll down to **Advanced settings** and set **Allow public client flows** to **Yes**, then **Save**
8. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions** and add the permissions you need:

   | Service | Permissions |
   |---|---|
   | Entra ID | `User.Read`, `User.Read.All`, `Group.Read.All`, `Directory.Read.All`, `Policy.Read.All`, `AuditLog.Read.All` |
   | Defender XDR | `SecurityEvents.Read.All`, `SecurityIncident.Read.All`, `ThreatHunting.Read.All` |

   > **Tip**: Start with `User.Read` to verify auth works, then add more permissions as needed. If you add new permissions later, re-run `npm run login` to pick them up.

9. If your organization requires it, click **Grant admin consent** for the permissions above

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

Before the MCP server can use Graph APIs, you must sign in once from your terminal. This opens a browser window via MSAL, authenticates you, and caches the tokens locally so the MCP server can use them silently.

**Windows (PowerShell):**

```powershell
$env:TENANT_ID="your-tenant-id"; $env:CLIENT_ID="your-client-id"; npm run login
```

**macOS / Linux:**

```bash
TENANT_ID="your-tenant-id" CLIENT_ID="your-client-id" npm run login
```

A browser window will open for Microsoft sign-in. After you authenticate, the MSAL token cache is saved to `~/.everydaymcp/msal-cache.json`. You only need to do this once (or again if your token expires or you change permissions).

### 6. Configure your MCP client

See the [MCP Client Configuration](#mcp-client-configuration) section below.

## Configuration

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | **Yes** | Your Entra directory (tenant) ID |
| `CLIENT_ID` | **Yes** | Your Entra app registration (client) ID |
| `WEATHER_API_KEY` | Yes* | weatherapi.com API key (*only required for weather tools) |
| `USE_GRAPH_BETA` | No | Set to `false` to use Graph v1.0 instead of beta |

### Authentication

The server uses **MSAL** (`@azure/msal-node`) with a two-step approach:

1. **`npm run login`** — Run once in your terminal. Opens a browser via `acquireTokenInteractive`, authenticates you, and persists the MSAL token cache to disk.
2. **MCP server** — On startup, loads the cached MSAL token cache and calls `acquireTokenSilent` to get tokens. No browser, no prompts.

Your user account's permissions determine what Graph data is accessible. The server will exit with an error at startup if `TENANT_ID` or `CLIENT_ID` are not set.

> **Re-authentication**: If your cached token expires or you add new permissions to the app registration, re-run `npm run login`.

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

> **Important:** The path must point to `build/main.js` (not `main.js`). Use forward slashes in the path even on Windows.

## Available Tools

### Entra ID

| Tool | Description |
|---|---|
| `entra-query` | Query Entra ID — users, groups, apps, roles, conditional access, sign-in logs, audit logs |

### Defender XDR

| Tool | Description |
|---|---|
| `defender-query` | Query Defender — alerts, incidents, secure scores, threat intel |
| `defender-advanced-hunting` | Run KQL queries via Defender XDR Advanced Hunting |

### Weather

| Tool | Description |
|---|---|
| `weather-current` | Current weather conditions for a location |
| `weather-forecast` | Weather forecast (up to 10 days) |
| `weather-search` | Search / autocomplete locations |
| `weather-astronomy` | Sunrise, sunset, moon phase data |

### Utility

| Tool | Description |
|---|---|
| `get-auth-status` | Check MSAL auth status, token expiry, and granted scopes |

## Troubleshooting

### "No cached login found" error
Run `npm run login` in your terminal first, then restart the MCP server.

### Token expired
Re-run `npm run login` to refresh the cached token.

### Permission denied errors from Graph API
Add the required permissions to your app registration in Entra (step 1.8), grant admin consent if needed, then re-run `npm run login`.

### Upgrading from v1
v2 replaces `@azure/identity` with MSAL (`@azure/msal-node`). After upgrading, re-run `npm run login` to create a new MSAL token cache.

### Server log location
The server writes logs to `~/.everydaymcp/server.log`.

## Example Queries

```
# Entra: list all users
entra-query { path: "/users" }

# Entra: sign-in logs from the last 24 hours
entra-query { path: "/auditLogs/signIns", queryParams: { "$top": "50", "$orderby": "createdDateTime desc" } }

# Defender: high severity alerts
defender-query { path: "/security/alerts_v2", queryParams: { "$filter": "severity eq 'high'" } }

# Defender: advanced hunting with KQL
defender-advanced-hunting { query: "DeviceProcessEvents | where Timestamp > ago(1d) | take 10" }

# Defender: failed sign-ins via KQL
defender-advanced-hunting { query: "IdentityLogonEvents | where ActionType == 'LogonFailed' | summarize count() by AccountName | top 10 by count_" }

# Weather: current conditions
weather-current { location: "Seattle" }

# Weather: 5-day forecast with alerts
weather-forecast { location: "New York", days: 5, alerts: true }
```
