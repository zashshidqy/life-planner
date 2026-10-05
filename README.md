# Life Planner

A commercial, offline-capable Progressive Web App for tracking real-life
progress. XP, levels, streaks, achievements — with a character system that
represents identity rather than a stat bonus.

> **Status: Phase 0 (foundation) — complete.** The repository, schema, ADRs, and CI
> exist and every exit criterion is green. There is no UI beyond a placeholder page
> and no progression logic beyond the XP ledger write that proves the idempotency
> constraint. Nothing here is a feature yet.
>
> See [`docs/STATUS.md`](docs/STATUS.md) for the verified exit-criteria scorecard,
> what is deliberately *not* done, and the constraints to carry into Phase 1.

## Documentation

- [`docs/PRD.md`](docs/PRD.md) — product requirements. Source of truth for **what**.
- [`docs/DESIGN.md`](docs/DESIGN.md) — visual design. Source of truth for **how it looks**.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the five invariants, how each is
  defended, and what breaking it costs.
- [`docs/GLOSSARY.md`](docs/GLOSSARY.md) — domain terms, especially the ones that are
  easy to conflate (quest / task / routine / habit, ledger / cache, level / lifetime XP).
- [`docs/STATUS.md`](docs/STATUS.md) — current phase, verified scorecard, known gaps.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phase order and pass/fail exit criteria.
- [`docs/adr/`](docs/adr/) — architecture decision records. Source of truth for **why**.

Start with [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing anything —
it is short, and it is the list of mistakes that are expensive to make. Read
`docs/adr/README.md` next if you want the full reasoning; two constraints are
load-bearing and non-obvious — the Workers 10 ms CPU limit and Neon scale-to-zero
both shape the architecture.

Working with an AI agent? [`AGENTS.md`](AGENTS.md) is the entry point and is
loaded automatically by most tools.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node | **≥ 22.18.0** | Required for native TypeScript type stripping and `--env-file-if-exists`. No `tsx` or `dotenv` dependency. |
| pnpm | 12.x | The project pins `pnpm@12.9.1` in `package.json`. |
| A Postgres database | any 17.x | Only for running migrations locally. **Not needed for `pnpm test`** — see below. |

`corepack` is not required; if `pnpm` is missing, `npm i -g pnpm@12.9.1`.

## Setup

```bash
pnpm i
cp .env.example .env.local
cp .dev.vars.example .dev.vars
pnpm dev
```

`pnpm dev` boots on <http://localhost:3000> and shows the placeholder page.

### Why two env files

Cloudflare Workers has no ambient process environment — every value arrives as a
binding. So the same values are declared twice:

| File | Read by | Committed? |
|---|---|---|
| `.env.local` | `next dev`, `next build`, Node tooling (`db:*`, `test`) | no |
| `.dev.vars` | `wrangler`, the OpenNext dev proxy | no |
| `.env.example` | you | **yes** |
| `.dev.vars.example` | you | **yes** |

They must stay in sync. That is a deliberate cost of having Next's build tooling
and wrangler agree on variable names — see `docs/adr/0001-platform.md`.

No secrets are committed. The placeholders in the `.example` files are not working
credentials.

## Database

Migrations are applied with **drizzle-kit** over the `pg` driver, which needs a
*direct* (non-pooled) connection — `CREATE INDEX` and `CREATE TYPE` cannot run
through Neon's transaction-mode pooler.

```bash
pnpm db:generate   # write a migration from schema changes
pnpm db:migrate    # apply pending migrations
pnpm db:seed       # load config, level curve, XP values
pnpm db:setup      # migrate + seed
pnpm db:studio     # browse the data
```

`drizzle.config.ts` reads `DIRECT_DATABASE_URL` and falls back to
`DATABASE_URL`.

### Running Postgres locally with podman

A throwaway Postgres is the simplest way to exercise migrations:

```bash
podman run -d --name life-planner-pg \
  -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:17

createdb_both() {
  podman exec life-planner-pg createdb -U postgres "$1"
}
createdb_both life_planner
createdb_both life_planner_test
```

Then in `.env.local`:

```dotenv
DIRECT_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/life_planner"
```

Verify the migration against real Postgres:

```bash
pnpm db:setup
podman exec -it life-planner-pg psql -U postgres -d life_planner -c '\dt'
```

All ten tables should be present. The append-only trigger can be confirmed
directly. Seed a row first — the trigger is row-level, so on an empty table the
statement below just reports `UPDATE 0` and proves nothing:

```sql
INSERT INTO users (id, username) VALUES ('u1', 'probe');
INSERT INTO xp_transactions (user_id, source_type, source_id, amount, reason)
VALUES ('u1', 'task_completed', 'task_1', 10, 'trigger probe');

UPDATE xp_transactions SET amount = 999 WHERE id = '<that row id>';
-- ERROR: xp_transactions is append-only (PRD §39): UPDATE is not permitted. …
```

## Testing

```bash
pnpm test            # run once
pnpm test:watch      # watch mode
pnpm test:coverage   # with coverage report → ./coverage
```

**Tests need no database, no container, and no credentials.** They run against
[PGlite](https://pglite.dev) — a real PostgreSQL engine compiled to WebAssembly,
running in-process — loaded with the *same* `drizzle/*.sql` migrations production
uses.

That means the migrations themselves are under test: a malformed migration file
fails the suite. And because PGlite is a real engine, unique indexes, CHECK
constraints, triggers, and `jsonb` behave as they do in production — the
idempotency test asserts that the database *rejects* a duplicate, not that the
code *intends* to avoid one.

### Coverage

| Scope | Threshold |
|---|---|
| `src/server/services/progression/**` | **100%** statements, branches, functions, lines |
| Everything else we own | 70% |

The 100% floor on progression code is enforced from the start, not retrofitted, so
that code is written test-first. Progression logic decides what a user is told they
earned, and a coverage number chased after the fact produces tests that execute
lines without asserting anything.

### Known limitation: concurrency

PGlite is **single-connection**, so the idempotency test proves a *sequential*
duplicate is rejected, not that two truly simultaneous inserts are. The test file
says so in its own header.

To check true concurrency against a real server:

```sql
-- in psql, against the migrated database
BEGIN;
INSERT INTO xp_transactions (user_id, source_type, source_id, amount)
VALUES ('u1', 'task_completed', 't1', 10);
-- second session:
BEGIN;
INSERT INTO xp_transactions (user_id, source_type, source_id, amount)
VALUES ('u1', 'task_completed', 't1', 10);
-- blocks, then: ERROR: duplicate key value violates unique constraint
--                 "xp_transactions_user_source_uidx"
COMMIT;
```

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Next dev server |
| `pnpm build` | OpenNext build → Workers (`.open-next/`) |
| `pnpm build:next` | Plain `next build` — fast, and shows `○ (Static)` per route |
| `pnpm preview` | `wrangler dev` against the built Worker |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `pnpm lint:fix` | ESLint |
| `pnpm ci` | lint → typecheck → test |
| `pnpm db:*` | see [Database](#database) |
| `pnpm cf:types` | regenerate `worker-configuration.d.ts` from `wrangler.jsonc` |

### `build:next` is the architecture check

ADR 0001 requires the app shell to be static so it costs zero Workers CPU and
zero counted requests. `pnpm build:next` prints a route table where the dashboard
must appear as `○ (Static)`.

> If a route flips to `ƒ (Dynamic)`, that is a regression against ADR 0001 — the
> 10 ms CPU ceiling does not allow server-rendered pages. Move the work to the
> client.

## CI

`.github/workflows/ci.yml` runs on every push, every pull request, and manual
dispatch: **lint → typecheck → test → build**, cheapest-and-most-likely-to-fail
first.

There is no Postgres service container. PGlite removed the need.

`pnpm i --frozen-lockfile` — a CI run that silently resolves different versions
than your machine is not testing the committed state.

## Deploy

**Not done, and not done on purpose.** No Cloudflare or Neon account was created in
Phase 0. The target is configured and the build verified locally.

The intended path, when there is a reason to:

```bash
wrangler secret put DATABASE_URL          # pooled, for neon-http
wrangler secret put DIRECT_DATABASE_URL   # direct, for migrations
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put RESEND_API_KEY
pnpm deploy
```

Secrets go through `wrangler secret put`, never into `wrangler.jsonc`'s `vars`
block — that block is plaintext in git and is currently empty.

## Repo layout

```text
docs/            PRD, DESIGN, ARCHITECTURE, GLOSSARY, ROADMAP, ADRs
drizzle/         generated migrations + journal
scripts/seed.ts  config and level-curve seed
src/app/         routes (placeholder only)
src/server/
  database/      client, schema/ (8 modules, 10 tables)
  services/
    progression/ award-xp.ts — the only XP grant path
src/test/        PGlite harness
```

`src/server/` holds rules; rendering lives in `src/app/` and will live in
`src/features/` from Phase 1. Domain logic and UI are kept apart per PRD §43.

## Conventions

- **Never derive progression on the client.** Server computes, client renders
  (PRD §11–13).
- **Never add a character stat column.** Characters grant no mechanical advantage,
  ever (PRD §8).
- **`xp_transactions` is append-only** and the source of truth. `user_progression`
  is a derived cache that must always be rebuildable from the ledger (PRD §39).
- **Never hardcode XP values or the level curve.** Both are `system_config` rows
  (PRD §11, §13). `awardXp()` reads them and throws if they are missing.
- **Config comes from the database, not from the client**, and there is a
  feature flag named after whatever you are tempted to hardcode.

## Known gaps

Honest list of what is *not* done:

- **No UI.** `src/app/page.tsx` is a placeholder with no Tailwind classes, because
  DESIGN §43 tokens are Phase 1.
- **`favicon.ico` is still the create-next-app default.** Replaced in Phase 1.
- **No auth.** Better Auth is chosen (ADR 0001) and `users.id` is shaped for it,
  but nothing is wired.
- **No Neon's Hyperdrive binding.** ADR 0001 records `neon-http` + Hyperdrive as
  the intended pairing; `wrangler.jsonc` has an empty `vars` block because Phase 0
  created no Cloudflare account.
- **`user_progression` is never written.** `awardXp()` writes only the ledger;
  `projectProgression()` is Phase 2. The projection must be provably rebuildable
  from the ledger — that property is the point of PRD §39.
- **`analytics_events` has no writer.** The tables and the retention query exist
  (ADR 0005); emission is Phase 4.
- **No events emitted, no real-Neon smoke test.** PGlite covers the engine, not
  the vendor layer.
- **`compatibility_date` is `2025-04-01`**, the floor for automatic
  `process.env` population. Workerd warns it is behind. Bumping it is safe and
  worth doing; it is left alone in Phase 0 so the floor is not accidentally raised
  past whatever the next runtime change requires.