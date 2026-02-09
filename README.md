# EverydayMCP

An MCP (Model Context Protocol) server that provides read-only access to:

- **Microsoft Entra ID** (Azure AD) — users, groups, service principals, conditional access, sign-in logs, audit logs
- **Microsoft Defender XDR** — security alerts, incidents, secure scores, threat intelligence, and **Advanced Hunting (KQL)**
- **Weather** — current conditions, forecasts, astronomy data via [weatherapi.com](https://www.weatherapi.com/)

Authentication is handled automatically — when your MCP client starts the server, a browser opens for Microsoft sign-in. No separate login step required.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Git](https://git-scm.com/)
- A Microsoft Entra (Azure AD) tenant with an app registration (see step 1 below)
- A [weatherapi.com](https://www.weatherapi.com/) API key (free tier available — only required for weather tools)

## Getting Started

### 1. Create an Entra App Registration

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/)
2. Navigate to **Identity** > **Applications** > **App registrations** > **New registration**
3. Fill in the registration form:
   - **Name**: `EverydayMCP` (or any name you prefer)
   - **Supported account types**: *Accounts in any organizational directory* (multi-tenant) for zero-config, or *single tenant* if you prefer
   - **Redirect URI**: Select **Single-page application (SPA)** and enter `http://localhost:3000`
4. Click **Register**
5. On the app's **Overview** page, copy these two values:
   - **Application (client) ID** → this is your `CLIENT_ID`
   - **Directory (tenant) ID** → this is your `TENANT_ID`
6. Go to **Authentication** > scroll to **Advanced settings** > set **Allow public client flows** to **Yes** > **Save**
7. Go to **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions** and add:

   | Service | Permissions |
   |---|---|
   | Entra ID | `User.Read`, `User.Read.All`, `Group.Read.All`, `Directory.Read.All`, `Policy.Read.All`, `AuditLog.Read.All` |
   | Defender XDR | `SecurityEvents.Read.All`, `SecurityIncident.Read.All`, `ThreatHunting.Read.All` |

   > **Tip**: Start with `User.Read` to verify auth works, then add more permissions as needed.

8. If your organization requires it, click **Grant admin consent**

> **Zero-config option**: If you register a multi-tenant app and hardcode its `CLIENT_ID` in `src/constants.ts` as `DefaultClientId`, no environment variables are needed at all — just like [Lokka](https://github.com/merill/lokka).

### 2. Clone and build

```bash
git clone https://github.com/bscarberry/everydaymcp.git
cd everydaymcp
npm install
npm run build
```

### 3. Configure your MCP client

Add the server to your MCP client configuration. When the MCP client starts the server, a browser window will open automatically for Microsoft sign-in. After authenticating, the server connects and is ready to use.

#### Claude Desktop

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "everydaymcp": {
      "command": "node",
      "args": ["/path/to/everydaymcp/build/main.js"],
      "env": {
        "TENANT_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "CLIENT_ID": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "WEATHER_API_KEY": "your-weatherapi-key"
      }
    }
  }
}
```

> **Note:** If you set a `DefaultClientId` in `src/constants.ts`, you can omit `TENANT_ID` and `CLIENT_ID` from the env block entirely.

## Configuration

### Environment variables

Set these in your MCP client configuration (`env` block). All are optional if you've configured defaults in `src/constants.ts`.

| Variable | Required | Description |
|---|---|---|
| `TENANT_ID` | No* | Your Entra tenant ID (*required if no `DefaultClientId` set) |
| `CLIENT_ID` | No* | Your Entra app client ID (*required if no `DefaultClientId` set) |
| `CLIENT_SECRET` | No | Enables client credentials mode (app-only, no browser) |
| `WEATHER_API_KEY` | No | weatherapi.com API key (required for weather tools only) |
| `USE_DEVICE_CODE` | No | Set to `true` to use device code flow instead of browser |
| `USE_GRAPH_BETA` | No | Set to `false` to use Graph v1.0 instead of beta |
| `REDIRECT_URI` | No | OAuth redirect URI (default: `http://localhost:3000`) |

### Authentication modes

| Mode | Trigger | How it works |
|---|---|---|
| **Interactive** (default) | No `CLIENT_SECRET`, no `USE_DEVICE_CODE` | Opens browser for sign-in when the MCP server starts |
| **Device Code** | `USE_DEVICE_CODE=true` | Prints a URL and code to enter on any device |
| **Client Credentials** | `CLIENT_SECRET` is set | App-only auth, no user interaction needed |

For interactive and device code modes, authentication happens automatically when the MCP client starts the server. No separate login step is needed.

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
| `get-auth-status` | Check auth status, token expiry, and granted scopes |

## Troubleshooting

### Browser doesn't open / auth fails
Make sure your app registration has **Allow public client flows** set to **Yes** and has the `http://localhost:3000` redirect URI configured as a **SPA** platform.

### Permission denied errors from Graph API
Add the required permissions to your app registration, grant admin consent if needed, then restart the MCP server to re-authenticate.

### Headless / remote environment
Set `USE_DEVICE_CODE=true` in your MCP client config. The server will print a URL and code instead of opening a browser.

### Server log location
`~/.everydaymcp/server.log`

## Example Queries

```
# Entra: list all users
entra-query { path: "/users" }

# Entra: sign-in logs
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
