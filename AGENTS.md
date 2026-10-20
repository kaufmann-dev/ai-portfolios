# Repository Instructions

## Build and Verification

Derive final commands from `package.json`, `pnpm-workspace.yaml`, and `drizzle.config.*`. Use these defaults:

```bash
pnpm install
pnpm dev                     # Local development
pnpm check                   # Run before finishing Svelte/TS changes
pnpm build                   # Run before finishing deployment/routing/server changes
pnpm test                    # If defined in package.json
pnpm exec vitest run         # If Vitest is configured without a test script
pnpm drizzle-kit generate    # Generate schema migrations
pnpm drizzle-kit migrate     # Execute migrations
```

- Always generate and run migrations through Drizzle Kit. Keep schema files and migrations aligned with the project config.

## Tooling

- **Svelte MCP**: Use before writing, reviewing, or refactoring Svelte or SvelteKit code.
  - Call `list-sections` to identify relevant documentation.
  - Fetch all relevant sections with `get-documentation`.
  - After writing Svelte code, run `svelte-autofixer` until it reports no issues or suggestions.
  - Generate a playground link only after the user asks for one, and only when the code was not written into the project.
- **Svelte file-editor**: Use this subagent for Svelte component/module work if available.

## Technology Stack

- **Framework**: SvelteKit with `@sveltejs/adapter-node`
- **UI**: Tailwind CSS and `shadcn-svelte`
- **Icons**: `@lucide/svelte`
- **Theme**: `mode-watcher`
- **Database**: Drizzle with PostgreSQL
- **Auth**: Better Auth with `genericOAuth` (Pocket ID sign-in) and `jwt` + `@better-auth/mcp` +
  `@better-auth/cimd` (OAuth 2.1 authorization server for MCP clients)
- **MCP**: `@modelcontextprotocol/server` v2 `createMcpHandler` at `/mcp` (2026-07-28 plus stateless
  2025 fallback), behind `requireMcpAuth`
- **Charts**: LayerChart through the shadcn-svelte `chart` component
- **Forms**: Superforms and Zod
- **Testing**: Vitest (node environment only)

Do not use frameworks or libraries just because they are installed. Keep optional infrastructure out of the project until its feature is being implemented.

## Project Structure

- `src/lib/server/portfolio/valuation.ts` is the deterministic core: pure functions with no clock
  reads, and the same inputs always give identical output. Nothing stores NAVs; every read
  recomputes them from executed rebalances, cached unadjusted closes, and corporate actions.
  Performance has no cash: daily P&L divided by the previous close's gross exposure, compounded.
- `src/lib/server/market/calendar.ts` is the NYSE calendar (holidays, 13:00 early closes).
  A submission fills at the first close strictly after it arrives (`effectiveDateFor`).
- `src/lib/server/services/` holds all business rules. MCP tools (`src/lib/server/mcp/tools.ts`)
  and form actions are thin callers. Throw `ServiceError` for messages safe to show users and AIs.
- Rebalances are unique per portfolio and effective date. A new submission replaces the pending
  one for the same close; a pending rebalance whose close has passed stays until prices arrive.
- `src/lib/server/jobs/refresh.ts` fetches market-wide grouped closes, splits, and dividends
  from Massive, one session at a time and in order, keeps every ticker's latest two closes in
  `last_closes`, marks pending rebalances executed, and mirrors the listed-ticker list into
  `tickers` once per trading day. `hooks.server.ts` starts it after running migrations.
- The Massive plan (`basic` or `starter`) is a Settings value (`services/settings.ts`). On Basic,
  `massive/client.ts` paces all requests to 5 per minute, and no request path calls Massive:
  `get_prices` reads `last_closes` and ticker validation reads `tickers`. Starter adds one
  snapshot request per `get_prices` call. MCP instructions and tool descriptions depend on the plan.
- `auth` is created by `initAuth()` in the server `init` hook after migrations (plugins seed
  OAuth tables and fetch Pocket ID discovery on creation); never construct it at import time.
- MCP tool scopes live in `src/lib/server/mcp/scopes.ts`. A token sees only the tools its
  scopes allow, and `/mcp` answers other tool calls with a `403` `insufficient_scope` challenge.
  New tools must be added to `TOOL_SCOPES`.
- SvelteKit's global CSRF check is replaced by `src/lib/server/csrf.ts` (same rule, minus
  `/api/auth/*`) because OAuth token requests are cross-origin form posts.
- `/.well-known/*` is routed to Better Auth in `hooks.server.ts` for OAuth discovery.
- UI follows flat, square, motionless defaults enforced in `src/routes/layout.css`. Colour marks
  only gains (`text-gain`), losses (`text-loss`), and the pending state (`pending`), always
  alongside a +/− sign or text.

## Svelte Implementation Patterns

Always treat this as a Svelte 5 project. Use runes, snippets, and fine-grained reactivity.

### Core State and Props

- Use `$props()` for component inputs. Always treat props as changeable.
- Use `$state` only for values that must update the template, a derived value, or an effect.
- Use `$state.raw` for large objects, API responses, or arrays that are reassigned entirely without deep mutation tracking.
- Use `$derived` for computed state, including values derived from props.
- Use `$derived.by` only when computation requires a multi-line function.

### Reactivity and Effects ($effect)

Never use `$effect` unless absolutely necessary (e.g., syncing with external non-Svelte libraries). Using `$effect` is almost always a sign the code should be refactored.

**❌ Wrong: `$effect` for computed state**

```svelte
let rowsPerPageValue = $state(String(data.query.rows));
$effect(() => {
  rowsPerPageValue = String(data.query.rows);
});
```

**✅ Right: Use `$derived`**

```svelte
let rowsPerPageValue = $derived(String(data.query.rows));
```

**❌ Wrong: `$effect` to react to state changes**

```svelte
let currentPage = $state(data.query.page);
$effect(() => {
  navUpdate({ page: currentPage });
});
<Select bind:value={currentPage} />
```

**✅ Right: React to events at the boundary**

```svelte
let currentPage = $state(data.query.page);
<Select bind:value={currentPage} onValueChange={(value) => navUpdate({ page: value })} />
```

**❌ Wrong: `$effect` for type conversion with `bind:`**

```svelte
let query = $state({ rowsPerPage: 10 });
let rowsPerPageValue = $state(String(query.rowsPerPage));
$effect(() => {
  const n = Number.parseInt(rowsPerPageValue, 10);
  if (!Number.isFinite(n) || n === query.rowsPerPage) return;
  query.rowsPerPage = n;
});
<Select bind:value={rowsPerPageValue} />
```

**✅ Right: Use getter/setter bindings**

```svelte
let query = $state({ rowsPerPage: 10 });
<Select
  bind:value={
    () => query.rowsPerPage.toString(),
    (value) => { query.rowsPerPage = Number.parseInt(value, 10); }
  }
/>
```

**Valid `$effect` Escape Hatch:**
When an effect must write state, track the external source and keep reads of the written target out of the dependency set using `untrack`:

```svelte
import { untrack } from "svelte";

let source = $state(0);
let target = $state(0);

$effect(() => {
  const next = source + 1;
  untrack(() => { target = next; });
});
```

Always write effects as browser-only by nature. For global event listeners, use `<svelte:window>` or `<svelte:document>` rather than `onMount` or an effect.

Use `createSubscriber` from `svelte/reactivity` to observe external sources. Use `$inspect.trace(label)` as the first line of a reactive block to debug update triggers.

If an effect genuinely needs explicit dependency control and the project uses `runed`, consider `watch`. Do not add `runed` only to avoid a small refactor.

### Component Architecture & Styling

Use modern Svelte replacements over legacy features:

- Use snippets and `{@render ...}` for reusable markup and component children.
- Use `<DynamicComponent>` for dynamic component rendering.
- Use `import Self from "./ThisComponent.svelte"` and `<Self>` for recursive rendering.
- Use classes with `$state` fields for shared reactive logic when it fits better than stores.
- Use `{@attach ...}` for new attachment code.
- Use `clsx`-style arrays and objects in `class` attributes for conditional classes.
- Use `onclick={...}` and other `on...` attributes for event listeners.
- Use keyed `{#each}` blocks with stable object identifiers. Never use the index as a key. Avoid destructuring if mutating the item.
- Use CSS custom properties for parent-to-child styling boundaries.
- Use `createContext` for typed context instead of unscoped shared module state when state must be per request or per tree.
- Enable `compilerOptions.experimental.async` in the `sveltekit()` plugin options in `vite.config.ts` to use `await` expressions and `hydratable` (requires Svelte >= 5.36).

### Legacy Features to Avoid in New Code

Avoid these legacy Svelte features in new or refactored code:

- `export let`, `$$props`, `$$restProps`
- `$: ` reactive blocks or assignments
- `<slot>`, `$$slots`, `<svelte:fragment>`
- `<svelte:component>` and `<svelte:self>`
- `use:action`
- `class:` directives
- `on:` event attributes (e.g., `on:click`)

## UI and Styling

- **shadcn-svelte**: All components are already pre-installed in `src/lib/components/ui/`. **Never run the CLI to install components, and never delete unused shadcn components during codebase cleanup.**
  - Never import components from a package named `shadcn-svelte`.
  - Import them only from local `#lib/components/ui/...` paths (SvelteKit 3 subpath imports, with explicit `.js`/`.svelte` extensions).
  - Use local component source as the final source of truth once a component has been copied into the project.
  - Customize with Tailwind classes using `class` and the local `cn()` helper.
- Available shadcn-svelte components: `accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button calendar card carousel chart checkbox collapsible combobox command context-menu data-table date-picker dialog drawer dropdown-menu form hover-card input input-otp label menubar navigation-menu pagination popover progress radio-group range-calendar resizable scroll-area select separator sheet sidebar skeleton slider sonner switch table tabs textarea toggle toggle-group tooltip`
- **Icons**: Always use `@lucide/svelte` (e.g., `<Search class="size-4" />`).
- **Theming**: Use `setMode("light" | "dark" | "system")` or `toggleMode` from `mode-watcher` for controls. Add `ModeWatcher` once in the root layout:
  ```svelte
  <script lang="ts">
  	import { ModeWatcher } from 'mode-watcher';
  	let { children } = $props();
  </script>

  <ModeWatcher />
  {@render children()}
  ```

## Backend and Services

- **Authentication**: Check current Better Auth documentation before implementing providers, plugins, adapters, session handling, or account flows.
  - _Server_: `export const auth = betterAuth({ ... });`
  - _Hook_: `return svelteKitHandler({ event, resolve, auth, building });`
  - _Client_: `export const authClient = createAuthClient();`
  - _Cookies_: `plugins: [sveltekitCookies(getRequestEvent)]`
- **Forms**: Always use Superforms with Zod. Follow the chain: `zod schema -> superforms -> formsnap -> shadcn-svelte form components`. Use `Form.Field`, `Form.Control`, and shadcn error components rather than ad hoc markup.

## Local Database and Deployment

- **Database**: Use the manually managed Podman PostgreSQL database named `postgres-sveltekit` for local development. Treat production database provisioning as separate infrastructure.
- **Debugging**: Keep deployment fixes scoped to the exact failing layer. Identify the failing command first in Coolify or Nixpacks before fixing it.

For Coolify and Nixpacks:

- If `pnpm-workspace.yaml` exists in a single-package app, keep a non-empty `packages` list with `.` included.
- Use `engines.node` and `nixpacks.toml` to pin compatible Node behavior when dependencies require a minimum patch version.
- Read deployment environment variables from `process.env`. Load `.env` only after checking that the file exists.
- Validate seed script environment variables before calling Better Auth APIs.
- Document and enforce minimum seeded account password lengths.
- Let Nixpacks handle the install phase unless a project-specific reason requires otherwise.
- Prefer explicit deploy or runtime migration and seed steps when Coolify supports them.
- Keep build-time migration and seed scripts idempotent when they must run during image builds.
