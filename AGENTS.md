<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Life Planner

A commercial, offline-capable PWA that turns real-life activity into XP, levels,
streaks, and achievements — with a character system that represents identity and
grants **no** mechanical advantage.

Runs on Cloudflare Workers against Neon Postgres. Currently at the end of
**Phase 0 (foundation)**: repo, schema, ADRs, CI, and exactly one progression
function. **There is no UI beyond a placeholder page and no feature code.** Do not
assume a feature exists because the PRD describes it.

## Read these three, in this order

| File | What you get |
|---|---|
| [`docs/STATUS.md`](docs/STATUS.md) | Which phase, what is verified, what is deliberately *not* done, and the constraints to carry forward. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Phase order and pass/fail exit criteria. Phases 2+ are provisional. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The five invariants below, with reasoning and ADR pointers. |

Then look things up rather than assume them: [`docs/PRD.md`](docs/PRD.md) is
authoritative for *what* the product is (1360 lines — read the section you need,
do not skim it for a summary). [`docs/adr/`](docs/adr/README.md) is authoritative
for *why*. [`docs/DESIGN.md`](docs/DESIGN.md) for appearance. Setup instructions
are in [`README.md`](README.md), not here.

## The five invariants

Each of these is a decision someone already made and paid for. Breaking one is
the expensive mistake this file exists to prevent.

**1. `xp_transactions` is the source of truth. `user_progression` is a disposable
cache.** — PRD §39, [ADR 0001](docs/adr/0001-platform.md)
Never treat a cache value as authoritative, and never compute a level from a cache
read. The cache must always be rebuildable from the ledger by
`projectProgression()`; that property is the entire point of the ledger. If you
build level-up logic on top of the cache, the cache stops being disposable and the
audit trail stops being trustworthy.

**2. Characters grant zero mechanical effect. Ever.** — PRD §8
No per-character XP multiplier, no streak bonus, no stat column, in any table, in
any branch, "just for this one character." Characters are identity and
personalisation only. This is enforced, not merely documented: a test scans every
column name in the progression core for `character` / `multiplier` / `bonus` /
`boost` / `xp_rate` and fails if it finds one. Cosmetic unlocks are fine; anything
that changes a number is not.

**3. Progression is computed server-side only.** — PRD §11–13
The server computes XP, level, and streak; the client renders them. No level curve
in the browser, no client-side XP totals, no trusting a `user_id` or an amount from
the request (§40).

**4. The app shell stays `○ (Static)`.** — [ADR 0001](docs/adr/0001-platform.md) Trap 2
Workers Free caps *active CPU* at 10 ms per invocation. Network wait is free;
rendering is not. A server-rendered dashboard burns the whole budget on rendering
and leaves none for the queries the architecture permits. If a route flips from
`○ (Static)` to `ƒ (Dynamic)` in `pnpm build:next` output, that is a regression
against the ADR — move the work to the client, do not raise the limit.

**5. Tunable values are `system_config` rows, never literals.** — PRD §11, §13, [ADR 0004](docs/adr/0004-system-config.md)
XP amounts, the level curve, caps, and feature flags all live in the database.
`awardXp()` deliberately has **no `amount` parameter** — that absence is the
mechanism that makes it impossible for any caller to nominate its own payout. Do
not add one, and do not add a default/fallback value: a missing config row throws
on purpose, because a silently-zero award is indistinguishable from a broken
feature.

Also cheap to get wrong: **Neon scale-to-zero must stay enabled.** An always-on
0.25 CU database burns ~180 CU-hr/month against a 100 CU-hr allowance — disabling
it does not risk the limit, it guarantees exceeding it. CI greps for this.

## Verify your environment with one command

```bash
pnpm run ci      # lint → typecheck → test. Needs no database and no credentials.
```

28 tests across 2 files must pass. Tests run against **PGlite** — a real
PostgreSQL engine in-process — loaded from the same `drizzle/*.sql` migrations
production uses, so the migrations are themselves under test.

`pnpm run ci` deliberately does **not** build. To check the invariant in #4:

```bash
pnpm run build:next   # route table must show ○ /  — not ƒ
```

## What is not done

Check `package.json` before assuming any dependency exists.

- **Better Auth is decided but NOT INSTALLED.** ADR 0001 chose it and `users` is
  shaped for it, but it is not in `dependencies` and no auth is wired. Do not
  `import { betterAuth } from "better-auth"` — it will not resolve.
- `dependencies` holds only: `@neondatabase/serverless`, `drizzle-orm`, `next`,
  `react`, `react-dom`, `server-only`.
- **No `projectProgression()`** — so `user_progression` is never written. The
  whole progression surface is `awardXp()`, which writes the ledger and nothing
  else. Levels, streaks, and achievement evaluation are Phase 2.
- **No level curve, no streak logic, no achievement evaluation** — Phase 2.
- **No design tokens and no UI primitives** — `src/app/page.tsx` is a
  placeholder. Phase 1. This is also why `favicon.ico` is still the
  create-next-app default.
- **No i18n runtime** — the `locale` enum (`en`/`id`) exists in schema only.
- **No character SVGs** — Phase 1.
- **No PWA manifest or service worker** — Phase 3, and offline *writes* are
  deferred to Phase 4 behind a conflict-resolution design (ADR 0003).
- **No analytics writer** — `analytics_events` exists, nothing emits to it (Phase 4).
- **Never deployed.** No real Cloudflare or Neon account has ever been created or
  touched. Every check in `STATUS.md` is local.
- **CI has never executed against a real runner.** The workflow is written and its
  local equivalents pass, but push a branch to find out.
