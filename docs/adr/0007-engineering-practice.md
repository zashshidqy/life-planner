# ADR 0007 — Repository, Testing, CI, and Deploy Practice

**Status:** Accepted
**Date:** 2026-10-05
**Closes:** Roadmap §0.2.6

---

## Context

Roadmap §0.2 item 6: *"No ADRs, no README, no local-dev instructions, no
testing/CI/deploy story."*

This is the least glamorous of the six gaps and the one most likely to be skipped
by anyone in a hurry, which is exactly why it needs deciding rather than
inheriting. A project with a schema and no test story discovers its constraints
are wrong at the worst moment.

The repository also starts with two documents written entirely in Indonesian, no
code, and no git repository. Everything below is being established from zero.

### The specific constraint that makes the obvious test setup wrong

The core property under test in Phase 0 is **a database constraint** —
`UNIQUE (user_id, source_type, source_id)` on `xp_transactions`, plus an
append-only trigger. This cannot be tested against a mock database, and it cannot
be tested against SQLite.

The property only exists if the database actually enforces uniqueness under
concurrent load and actually rejects `UPDATE`. So the test database must be
**real PostgreSQL**.

That leaves three options, and they differ enormously in what a contributor has to
do before running `pnpm test`:

| Option | Fidelity | Contributor setup |
|---|---|---|
| Docker/podman Postgres | Real PG, separate process | Container runtime, port management, wait-for-ready loop |
| Neon branch | Real PG, real prod vendor | Account, credentials, network, **and it costs CU-hours** |
| **PGlite** | **Real PG, in-process** | **`pnpm i` and nothing else** |

## Decision

### Repository

`pnpm`, ESLint flat config, `tsconfig` with `noUncheckedIndexedAccess` and
`allowImportingTsExtensions`. Node ≥ 22.18 is required so that type stripping runs
TypeScript natively — which is why there is **no `tsx` and no `dotenv`
dependency**: `node scripts/seed.ts` and `node --env-file-if-exists=.env.local` do
both jobs with nothing installed.

`.editorconfig` is committed because this project has exactly one developer who
will not be the one reading this file in two years, and trailing-whitespace
conflicts are not worth the merge.

### Tests: PGlite, real migrations, zero external services

`pnpm test` requires **no database, no container, and no credentials.** The suite
runs against PGlite — an actual PostgreSQL engine compiled to WebAssembly, running
in-process — loaded with the **same `drizzle/*.sql` migrations production uses**.

Three properties of that choice matter:

1. **The migrations are under test.** The suite runs `drizzle-orm/pglite/migrator`
   over the real `drizzle/` directory. If a migration file is malformed, the test
   suite fails — so a broken migration cannot reach a database unnoticed. This is
   the second reason the roadmap's Phase 0 exit criterion is satisfiable at all.
2. **The tests exercise the real engine.** Unique indexes, CHECK constraints,
   triggers, and `jsonb` behave as they do in production. A mock would assert that
   the code *intends* to insert with `onConflictDoNothing`; PGlite asserts that the
   database *rejects* the duplicate.
3. **Contribution friction is zero.** This is the reason the other two options
   lost. A test suite that needs a container is a test suite that gets skipped.

**The tradeoff, stated plainly:** PGlite is **single-connection**, so the
concurrency test cannot fire two truly simultaneous inserts. The idempotency test
therefore proves the constraint rejects a sequential duplicate, and notes in the
test itself that true simultaneity is verified once against a real server via the
procedure in the README. Claiming concurrency coverage from PGlite would be false,
so it is not claimed.

The suite runs with `fileParallelism: false` because fixtures truncate shared
tables. Per-file schemas would fix that and is the obvious next step when a second
test file needs isolation.

### Coverage thresholds are enforced, not aspirational

`100%` on `src/server/services/progression/**`, `70%` globally.

The `100%` is not vanity. The roadmap's Phase 2 exit criterion demands 100% branch
coverage on the progression services, and **enforcing it from Phase 0 means that
code is written test-first instead of chased up to a number afterwards.** Progression
logic is where the money of this product lives — it decides what a user is told
they earned — and a coverage number that is chased after the fact produces tests
that execute lines without asserting anything.

Schema files are **excluded** from coverage: they are declarative DDL, and their
correctness is verified by the migrations actually running against a real engine,
which the PGlite setup already does.

### The `server-only` boundary is enforced by the bundler, not by lint

`src/server/database/client.ts` and `src/server/services/progression/award-xp.ts`
begin with `import "server-only"`. That import throws at **bundle time** if the
module is pulled into a client graph, which turns "server code must not run on the
client" from a code-review rule into a build error.

The obvious alternative — ESLint `no-restricted-imports` — **was tried and
rejected.** It flagged server-on-server imports (which are the entire point of the
`server/` tree) and produced 9 errors out of 11 in the initial scaffold. Fixing it
means maintaining a path allowlist that breaks whenever a file moves, which is
strictly worse than an error the bundler produces for free. The reasoning is
recorded in `eslint.config.mjs` so it is not re-attempted.

In tests, `server-only` is aliased to its no-op entry, because Vitest does not
resolve the `react-server` condition Next.js sets. The guard's real value is at
bundle time.

### CI: lint, typecheck, test, build

Runs on push, pull request, and manual dispatch. Order is deliberate:
**lint → typecheck → test → build**, cheapest and most-likely-to-fail first, so a
broken commit is diagnosed in seconds rather than after a full Workers build.

`pnpm i --frozen-lockfile`, because a CI run that silently resolves different
versions than a developer's machine is not testing the committed state.

**No Postgres service container.** PGlite removed the need — the same
zero-setup property that makes local `pnpm test` pleasant also makes CI a
dependency-free step.

### Deploy: `wrangler.jsonc` has empty `vars`, and secrets are secrets

Cloudflare populates `process.env` from bindings when `nodejs_compat` is on and
`compatibility_date` ≥ 2025-04-01, so application code reads
`process.env.DATABASE_URL` unchanged in dev, build, and production.

The consequence is that **every secret must be a Worker secret** set with
`wrangler secret put`. Anything in `wrangler.jsonc`'s `vars` block is plaintext in
git. That block is empty and stays empty; the file carries a comment saying so.

`.env.example` and `.dev.vars.example` are committed. `.env.local` and `.dev.vars`
are not. Two files must be kept in sync for local development — an accepted
annoyance, recorded in ADR 0001 as the cost of having Next's build tooling and
wrangler read the same variable names.

### Documentation

This directory is the documentation. ADRs cover decisions; `README.md` covers the
mechanical facts (prerequisites, commands, env vars). Anything that explains *why*
belongs in an ADR, not in a code comment — code comments explain the adjacent
line and nothing else.

## Consequences

**Accepted:**

- **True concurrency is not proven by the test suite.** It is proven once, manually,
  against a real Postgres via the README procedure. If a future contributor reads
  the idempotency test as proving concurrency safety under load, they are wrong,
  and the test file says so in its own header.
- Tests run serially across files. Slower, but correct while fixtures share
  tables.
- No integration test against a *real Neon instance*. The engine is right; the
  vendor-specific layer (`neon-http` HTTP protocol, Hyperdrive, cold starts) is
  untested until deploy. Nothing available in Phase 0 tests it without creating an
  account, which the scope guardrail forbids.
- ESLint v9 is **pinned**. `eslint-config-next@16.3.8` declares a peer of
  `eslint >= 9` but depends on `eslint-plugin-react@^7.37.0`, which crashes on
  ESLint 10 (`contextOrFilename.getFilename is not a function`). The pin is
  deliberate; removing it will break lint with a message that does not explain why.
- `next build` and `pnpm build` both exist. `build:next` is the fast feedback loop
  for verifying the static-shell architecture (`○ (Static)` in output, ADR 0001);
  `build` is the real Workers build. The static check is what makes the 10 ms CPU
  rule enforceable.

**Accepted as the right trade:**

- PGlite is not a drop-in replacement for Postgres in every respect (extensions,
  collation, some `EXPLAIN` output). The schema uses nothing outside core PG,
  verified by probing the specific features the migration needs — `plpgsql`, the
  append-only trigger, `TRUNCATE`, `num_nonnulls`, and `jsonb_typeof` — all of
  which PGlite supports.
- Node-only tooling (`db:migrate`, `db:seed`) needs the `pg` driver installed. It
  is a dev dependency, and it is required: with it absent, drizzle-kit silently
  selects `@neondatabase/serverless` and DDL against a local Postgres fails with a
  confusing error.

**Revisit trigger:**

- A second test file needs isolation, or the suite gets slow → per-file schemas.
- More than one non-trivial XP source exists → real concurrency test in CI becomes
  worth a service container.
- A Neon account exists → a nightly smoke test against a real Neon branch, to
  cover the vendor layer PGlite cannot.

**Post-hoc verification note.** `pnpm dev` was originally listed here as unverified.
It has since been run and serves HTTP 200 (`docs/STATUS.md` §2). Doing so exposed a
real defect this ADR did not anticipate: `next.config.ts` carried a `webpack` key,
which Next 16 rejects under Turbopack, so `next dev` failed to start at all. The key
was removed — it only set dev-only `watchOptions.ignored` for directories Turbopack
already skips via `.gitignore`. The general lesson is worth keeping: a dev-server
config that nobody runs is not a config, it is a guess.