# AI Portfolios

A private website that hosts stock portfolios managed by AI agents through a built-in MCP server.
You prompt your AI ("use the ai-portfolios MCP server to manage portfolio `growth` with strategy
`momentum-v1`"). The AI reads the portfolio's holdings, history, and performance, and fetches the
hosted strategy. It then submits the complete new target portfolio: tickers, whole share counts,
long or short, and a rationale for the whole portfolio. Each newly opened position also records a
thesis and an exit plan, which stay attached to the holding so the next evaluation can judge
whether to keep or close it.

- **Closing prices only.** A submission fills at the closing price of the first U.S. market close
  after it arrives. Until that close, the portfolio page lists the orders to place (buy, sell,
  sell short, buy to cover) to mirror it in a real account.
- **No cash.** Daily P&L is divided by the previous close's gross exposure (longs plus shorts), and
  those daily returns are compounded into total return. Splits adjust share counts. Cash dividends
  are credited to longs and charged to shorts on the ex-date. There are no trading costs.
- **Prices** come from [Massive](https://massive.com): unadjusted daily closes, splits, and
  dividends, fetched every 10 minutes once a session has closed. Choose your Massive plan in
  Settings. On the free **Basic** plan, requests are paced to 5 per minute and only the background
  refresh calls Massive: `get_prices` returns the latest close, and tickers are checked against a
  list of active U.S.-listed stocks and ETFs mirrored once per trading day. On **Starter or
  higher**, `get_prices` returns snapshot prices (delayed or real-time) in one request.
- **Price history** for AI clients: the refresh also keeps a year (260 sessions) of
  split-adjusted daily bars for every U.S. ticker, about 3 million rows. After the first deploy it
  backfills 30 sessions per run, newest first, which takes about an hour and a half on Basic.
  `get_price_history` and `screen_movers` read these bars, so they never call Massive.

Stack: SvelteKit (adapter-node), Svelte 5, Tailwind and shadcn-svelte, Drizzle and PostgreSQL,
Better Auth (Pocket ID sign-in and the MCP OAuth server), the MCP TypeScript SDK v2, and Vitest.

## Development

Requirements: Node 24 and pnpm 11. For the database, create `ai_portfolios` in the local Podman
PostgreSQL container `postgres-sveltekit`.

```bash
pnpm install
cp .env.example .env   # fill in the values; see Environment Variables
pnpm dev               # http://localhost:5173
```

The server applies pending migrations on startup. Other commands:

```bash
pnpm check             # svelte-check
pnpm lint              # prettier + eslint
pnpm test              # vitest
pnpm build && pnpm start
pnpm db:generate       # generate a migration after editing src/lib/server/db/schema.ts
```

Better Auth tables live in `src/lib/server/db/auth-schema.ts`, generated with `npx auth generate`.

## Environment Variables

| Variable                   | Required | Purpose                                                                                                                   |
| -------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`             | Yes      | PostgreSQL connection string                                                                                              |
| `ORIGIN`                   | Yes      | Public URL of the app, e.g. `https://portfolios.example.com`; also needed at build time (SvelteKit `paths.origin`)        |
| `BETTER_AUTH_SECRET`       | Yes      | Random secret for sessions (`openssl rand -base64 32`)                                                                    |
| `POCKET_ID_ISSUER`         | Yes      | Pocket ID base URL, e.g. `https://id.example.com`                                                                         |
| `POCKET_ID_CLIENT_ID`      | Yes      | OIDC client ID from Pocket ID                                                                                             |
| `POCKET_ID_CLIENT_SECRET`  | Yes      | OIDC client secret from Pocket ID                                                                                         |
| `MASSIVE_API_KEY`          | Yes      | Massive API key for prices, corporate actions, and ticker data; any plan, including the free Basic; select it in Settings |
| `REFRESH_INTERVAL_MINUTES` | No       | Minutes between market-data refresh runs (default `10`)                                                                   |

The app refuses to start when a required variable is missing or when Pocket ID's discovery
document cannot be loaded.

## Authentication Setup

Every page requires a Pocket ID sign-in. The app shows its own login page, whose button starts an
OIDC Authorization Code flow with PKCE. Better Auth keeps the resulting session in an HttpOnly
cookie for seven days from sign-in, without extension. Sign-out ends both the local session and
the Pocket ID session. MCP client authorizations use the same sign-in, then a consent page. Pocket
ID's access policy decides who may sign in, and every signed-in user sees all portfolios.

- Public Client: Off
- Callback URL: `/api/auth/callback/pocket-id`
- Logout Callback URL: `/login`
- Environment variables: `POCKET_ID_ISSUER`, `POCKET_ID_CLIENT_ID`, `POCKET_ID_CLIENT_SECRET`,
  `BETTER_AUTH_SECRET`, and `ORIGIN` (all required; see Environment Variables)

## MCP

The app is a remote MCP server at `<ORIGIN>/mcp` (Streamable HTTP, HTTPS in production). It is also
its own OAuth 2.1 authorization server, so ChatGPT, Claude (web, desktop, and Code), Codex, and
other MCP clients connect with just the URL:

- Discovery: protected resource metadata (RFC 9728) at `/.well-known/oauth-protected-resource/mcp`
  and authorization server metadata (RFC 8414) at `/.well-known/oauth-authorization-server/api/auth`.
  Unauthenticated requests get a `401` whose `WWW-Authenticate` header points to them.
- Client registration: Client ID Metadata Documents, and open Dynamic Client Registration (RFC 7591)
  for older clients. Loopback-redirect registrations without `application_type` are treated as
  native apps (RFC 8252).
- Authorization code flow with PKCE (S256 only). The user signs in with Pocket ID and approves the
  requested scopes on the consent page.
- Access tokens are JWTs bound to the MCP resource (`aud`), valid for 15 minutes and verified on
  every request. `offline_access` issues rotating refresh tokens.
- The server speaks MCP 2026-07-28 and, statelessly, the 2025 protocol revisions.

| Scope              | Tools                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `portfolios:read`  | `list_portfolios`, `get_portfolio`, `get_prices`, `get_price_history`, `screen_movers`, `validate_tickers` |
| `portfolios:write` | `create_portfolio`, `submit_portfolio`                                                                     |
| `strategies:read`  | `list_strategies`, `get_strategy`                                                                          |
| `strategies:write` | `create_strategy`, `update_strategy`                                                                       |

A token only lists the tools its scopes allow. Calling another tool returns `403` with an
`insufficient_scope` challenge, so the client can ask for more access. Settings lists connected
apps; revoking one deletes its consent and refresh tokens.

```bash
claude mcp add -s user --transport http ai-portfolios https://portfolios.example.com/mcp   # then /mcp → Authenticate
codex mcp add ai-portfolios --url https://portfolios.example.com/mcp && codex mcp login ai-portfolios
```

| Tool                | Purpose                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `list_portfolios`   | Portfolios with performance and pending-rebalance counts                                                                                |
| `create_portfolio`  | Create an empty portfolio                                                                                                               |
| `get_portfolio`     | Holdings with weight, thesis, and exit plan; closed positions with realized P&L; rationale, metrics, rebalances                         |
| `submit_portfolio`  | Submit the complete target portfolio with a required rationale; new positions need a `thesis` and `exit`                                |
| `get_prices`        | Latest close (Basic) or snapshot price (Starter or higher) and previous close, for sizing whole-share positions                         |
| `get_price_history` | Split-adjusted daily bars for up to 20 tickers with 52-week range, 20/50/200-session averages, volatility, and dollar volume            |
| `screen_movers`     | Every U.S. common stock and ADR whose one- or two-session move relative to SPY (or a sector ETF) was unusually large in recent sessions |
| `validate_tickers`  | Check tickers against the daily list of active U.S.-listed stocks and ETFs                                                              |
| `list_strategies`   | Hosted strategies                                                                                                                       |
| `get_strategy`      | Full text of a hosted strategy                                                                                                          |
| `create_strategy`   | Host a new strategy                                                                                                                     |
| `update_strategy`   | Change a strategy's name, slug, or text                                                                                                 |

Strategies are written and edited on the Strategies page or through the strategy tools.

## Coolify Deployment

- **Build Pack:** Railpack. It installs Node from `engines.node` and the pnpm version from
  `packageManager`, then starts the `start` script (`node build`); no `railpack.json` is needed.
- **Base Directory:** `/`
- **Database:** a Coolify PostgreSQL resource; set its internal URL as `DATABASE_URL`. Migrations
  run automatically when the app starts, so no deployment commands are needed.
- **Environment Variables:** set every required variable from Environment Variables at runtime.
  None are needed at build time.
