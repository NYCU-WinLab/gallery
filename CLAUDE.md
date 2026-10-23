@AGENTS.md

# WinLab Gallery

The rewrite of gallery.winlab.tw (once `apps/gallery` in NYCU-WinLab/portal.winlab.tw) on its own Postgres, with photo files in Nextcloud. Built on the same skeleton as NYCU-WinLab/portal; keep the two alike.

## Rules

- **Every read and write is an action** in `lib/actions/<app>.ts`, made with `defineAction` and listed in `lib/actions/registry.ts`. Pages call `runAction(action, actor, input)`; `lib/mcp/server.ts` builds the MCP tools from the same registry. Never write a separate MCP tool or a page-only query.
- **Only `lib/actions`, `lib/auth` and `lib/db` import `@/lib/db`.** `bun run actions:check` fails otherwise, and when an action is missing from the registry.
- **An action stays off MCP only with a reason** in `mcpExcludedBecause`, e.g. a signature image an agent must never supply.
- **Action fields**: `name` snake_case (the tool name), `title` in Chinese (what members call it), `description` in English for agents, `kind` query or mutation.
- **Permissions live in the action's `run`**, checked against `actor.userId`; a page and an MCP call get the same answer.
- **Schema**: edit `lib/db/*.ts`, run `bun run db:generate`, commit the SQL in `drizzle/`. Tables are snake_case plurals; the Better Auth tables keep its model names as export keys (`user`, `oauthClient`) so its adapter finds them.
- **External services get one module each** in `lib/<service>.ts` (`lib/keycloak.ts`, `lib/nextcloud.ts`). It reads its credentials from the environment, never touches the database, and only actions call it. The one exception is `/media`, which streams bytes from `lib/nextcloud.ts` after checking the session.
- **Files belong to Nextcloud, rows to Postgres.** A photo is `<NEXTCLOUD_ROOT>/<id>/` (original, thumb.webp, large.webp). Write the files before the row, delete the row before the files. The account is shared with other apps: never touch anything outside `NEXTCLOUD_ROOT`.
- **Members only.** Every page calls `requireActor`, every file goes through `/media`; nothing is public.
- **Every page updates live.** `runAction` announces each successful mutation (`lib/actions/changes.ts`, Postgres NOTIFY) and every open page refreshes through `/api/events`. A write that skips `runAction` leaves other members looking at stale data, which is one more reason never to write around an action.
- **Shell links prefetch.** Pages are per member and dynamic, so Next 16 prefetches them only when asked: links in `app-shell` carry `prefetch`, except ones that point at a route handler (`/sign-in`). Check prefetching with `next start`; dev never prefetches.
- **Measure before tuning.** When a page feels slow, look first at its server span in Sensorium (service `gallery`), then the network (`curl -w`), then the client (prefetch, animations), and change the slow part only.
- **MCP lives at `/mcp`**; discovery is under `/.well-known/` at the site root.
- **Design** comes from ui.winlab.tw (`bunx shadcn@latest add @winlab/<item>`); its DESIGN.md is the rulebook and `bun run tokens:check` enforces the token part.
- **Observability**: actions run in a span (`action <name>`, with `via` web or mcp); send ids and counts, never member content.

## Verify

`bun run typecheck && bun run lint && bun run format:check && bun run tokens:check && bun run actions:check && bun run build`. Build and run on the sandbox, not the MacBook.
