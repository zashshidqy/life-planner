# LIFE PLANNER — Phase 0 Status & Handoff

**As of:** 2026-10-05
**Phase:** 0 (foundation) — **complete**, both blockers resolved
**Roadmap:** [`docs/ROADMAP.md`](ROADMAP.md) (in this repo)

> This file used to live at `~/.opencode/plan/LIFE_PLANNER_STATUS.md`. It now lives in
> the repo, where it belongs — it is part of the project's state, not a side note.

---

## 1. BLOCKERS — both resolved

### B1. Nothing committed to git — RESOLVED

Was: `git rev-list --count HEAD` → `fatal: ambiguous argument 'HEAD'`, 0 tracked
files, 23 untracked paths. Every piece of Phase 0 was one `git clean -fd` from gone.

Now: 1 commit, 51 files, 18,467 insertions. Verified build artifacts are not
tracked (`.open-next/`, `.next/`, `coverage/`, `.wrangler/`, `node_modules/`,
`*.tsbuildinfo` all gitignored and confirmed unstaged).

### B2. `pnpm run typecheck` failed, and the fix in place was inert — RESOLVED

Was:

```
$ pnpm run typecheck
open-next.config.ts(44,3): error TS2353: Object literal may only specify known
properties, and 'buildCommand' does not exist in type 'CloudflareOverrides'.
```

`buildCommand` had been passed **into** `defineCloudflareConfig()`. That does not
work, for a reason worth keeping: `defineCloudflareConfig()` takes a
`CloudflareOverrides` object — a *fixed* key set (`incrementalCache`, `tagCache`,
`queue`, `cachePurge`, `enableCacheInterception`, `routePreloadingBehavior`) — and
returns a **freshly constructed literal**. Unknown keys are not spread through; they
are dropped on the floor. `buildCommand` is a top-level `OpenNextConfig` key, so it
has to be attached to the *returned* object.

Verified at source before changing anything:

| Claim | Verified against installed packages | Result |
|---|---|---|
| `buildCommand` is a `CloudflareOverrides` key | `@opennextjs/cloudflare/dist/api/config.d.ts` | **No** — not in the key set |
| Passing it in is silently discarded | `config.js:8-44` destructures known keys, returns a new literal | **Yes** — dropped |
| Omitting it recurses | `@opennextjs/aws/dist/build/buildNextApp.js:11` `config.buildCommand ?? \`${packager} build\`` | **Yes** — with pnpm that is `pnpm build` = `opennextjs-cloudflare build` |

Fix applied — `buildCommand` spread onto the returned config:

```ts
const base = defineCloudflareConfig({
  incrementalCache: "dummy",
  routePreloadingBehavior: "none",
});
const config = { ...base, buildCommand: "pnpm build:next" };
export default config;
```

Traced the full consumption chain to confirm the key is actually read and not just
type-checked: `compileOpenNextConfig` imports the default export verbatim →
`validateConfig` ignores unknown keys → `normalizeOptions` puts `config` on
`options.config` → `buildNextjsApp` reads `options.config.buildCommand`.

### B3. A fresh clone could not typecheck — RESOLVED

Discovered by the scratch-clone proof in §8, not by inspection. This one is worth
recording precisely because every local signal said the project was fine.

Was, on a clone that had never been built:

```
$ pnpm run typecheck
src/app/layout.tsx(22,50): error TS2304: Cannot find name 'LayoutProps'.
```

`src/app/layout.tsx` annotates its props as `LayoutProps<"/">`, a type Next 16
generates rather than ships. The generator writes two things, and **both are
gitignored** — `next-env.d.ts` (`.gitignore:56`) and everything under
`.next/types/`. So the type existed in the working tree only as a leftover from a
previous `pnpm build`.

Why every earlier check missed it: `pnpm run ci`, `pnpm run typecheck`, and the
whole §2 evidence block were run in a directory that had already been built. The
claim was true and the claim was not reproducible, which is the same failure mode
as an unverified claim, reached from the opposite direction.

This would have failed the first real CI run, because `.github/workflows/ci.yml`
runs `typecheck` *before* `build` and never runs a build first.

Fix — `typecheck` now generates the types it depends on:

```json
"typecheck": "next typegen && tsc --noEmit"
```

`next typegen` (present in Next 16.3.8) emits `next-env.d.ts` and
`.next/types/routes.d.ts` without a full build, in about a second. `tsconfig.json`
already listed both paths in `include`, so no config change was needed.

Verified in a scratch clone with `.next/` and `next-env.d.ts` deleted:
`pnpm run ci` → EXIT=0, 28/28; `pnpm run build:next` → `○ (Static)`;
`pnpm run dev` → HTTP 200.

**The generalisable lesson, and the reason this file now recommends the scratch
clone:** "it worked on my machine" and "it works from a clean checkout" are
different properties, and this repo had been asserting the second while only ever
testing the first. Any future exit criterion phrased "fresh clone →" should be
*run* in a fresh clone, not reasoned about.

---

## 2. VERIFIED COMMAND OUTPUT

Every command below was run after the B2 fix. Nothing is quoted from memory.

> **Correction, 2026-10-05.** The `typecheck` block below was true in the working
> tree and **false in a fresh clone**. `LayoutProps<"/">` in `src/app/layout.tsx`
> is generated by `next build`, and both `next-env.d.ts` and `.next/types/` are
> gitignored — so a clone that had never built could not resolve the type, and
> `tsc --noEmit` failed with `TS2304: Cannot find name 'LayoutProps'`. Since CI
> typechecks *before* it builds, **the first CI run would have failed.** Found by
> cloning to a scratch directory, which is now B3 below. Fixed by making
> `typecheck` generate its own types: `"typecheck": "next typegen && tsc --noEmit"`.

```
$ pnpm run lint
$ eslint .
(no output)
EXIT=0                                     ← 0 errors, 0 warnings

$ pnpm run typecheck
$ next typegen && tsc --noEmit
✓ Types generated successfully
EXIT=0

$ pnpm run test
 Test Files  2 passed (2)
      Tests  28 passed (28)
EXIT=0

$ pnpm run ci
EXIT=0                                     ← lint && typecheck && test
```

### Build — completes, both routes Static

```
$ pnpm run build
$ opennextjs-cloudflare build
Next.js version : 16.3.8
@opennextjs/cloudflare version: 1.20.8
@opennextjs/aws version: 4.1.7
WARN workerd compatibility_date: 2025-04-01, consider updating your wrangler config...

┌─────────────────────────────┐
│ OpenNext — Building Next.js app │
└─────────────────────────────┘

$ next build                                ← the recursion guard working
▲ Next.js 16.3.8 (Turbopack)
✓ Compiled successfully in 1410ms
✓ Generating static pages using 5 workers (4/4) in 742ms

Route (app)
┌ ○ /
└ ○ /_not-found

○  (Static)  prerendered as static content

⚙️ Worker saved in `.open-next/worker.js` 🚀
OpenNext build complete.
EXIT=0
```

**"Building Next.js app" appears exactly once.** That header count is the
recursion tripwire: the broken configuration emitted it 59 times and never wrote a
worker.

**`/` is `○ (Static)`**, as required by `docs/adr/0001-platform.md` §"Trap 2".
This is load-bearing, not cosmetic: Workers Free caps active CPU at 10 ms per
invocation excluding network I/O, so server-rendering a page spends the budget on
rendering instead of on the one indexed query the architecture allows. A `ƒ (Dynamic)`
route here is an architectural regression, and `src/app/page.tsx` documents itself as
the tripwire for exactly that.

### Dev server — boots and serves

```
$ pnpm run dev
▲ Next.js 16.3.8 (Turbopack)
✓ Ready in 682ms

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
200                         (11232 bytes, <title>Life Planner</title>)
```

No Turbopack errors in the log. This required removing the `webpack` key from
`next.config.ts` — see §5.

### Migration against real PostgreSQL

Migrations were applied with `drizzle-kit migrate` against **PostgreSQL 17.11**
(podman, port 54329) and the append-only trigger was confirmed live.

**Re-verified 2026-10-05**, from a clean container, because a claim nobody can
reproduce is worth nothing. Setup and result, in full:

```bash
podman run -d --name life-planner-pg -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine
podman exec life-planner-pg createdb -U postgres life_planner
# select version() → PostgreSQL 17.11 on x86_64-pc-linux-musl
DIRECT_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/life_planner" pnpm run db:migrate
# → migrations applied successfully!
```

```sql
-- Both rejected, with the trigger's own message:
UPDATE xp_transactions SET amount = 999;
-- ERROR:  xp_transactions is append-only (PRD §39): UPDATE is not permitted. …
DELETE FROM xp_transactions;
-- ERROR:  xp_transactions is append-only (PRD §39): DELETE is not permitted. …

-- ON DELETE RESTRICT also holds:
DELETE FROM users WHERE id = 'u-verify';
-- ERROR:  update or delete on table "users" violates foreign key constraint
--          "xp_transactions_user_id_users_id_fk" on table "xp_transactions"
```

> **One correction to the evidence previously recorded here.** The earlier version
> quoted `UPDATE xp_transactions SET amount = 999;` as producing that error. On a
> freshly migrated, **empty** table it does not — it returns `UPDATE 0`, because a
> row-level `BEFORE UPDATE OR DELETE` trigger never fires when no row matches. The
> trigger was fine; the reproduction was incomplete. Seed a row first, then mutate
> it. `README.md` §"Running Postgres locally with podman" carries the same snippet
> and the same caveat.

All 10 application tables present (plus drizzle's own `__drizzle_migrations`
bookkeeping table, so 11 rows in `information_schema` for the `public` schema).
`pnpm db:seed` loads 20 `system_config` keys and is idempotent — re-run leaves the
count at 20.

---

## 3. PHASE 0 EXIT CRITERIA — scorecard

| Criterion | Status | Evidence |
|---|---|---|
| Fresh clone → `pnpm i && pnpm dev` runs | ✅ | Verified in a **scratch clone** 2026-10-05: `pnpm i --frozen-lockfile` → `pnpm run ci` EXIT=0 → `pnpm dev` → HTTP 200, 11,232 bytes (see §2) |
| `pnpm build` succeeds against Workers target | ✅ | EXIT=0, `.open-next/worker.js` written |
| All 6 gap decisions written with reasoning | ✅ | 7 ADRs, `docs/adr/` |
| Schema applied to a dev database; config + analytics tables designed | ⚠️→✅ | Applied to local **Postgres 17.11** (`postgres:17-alpine`, podman), trigger re-verified live. **Still never run against real Neon** — no account, by design (scope guardrail). |
| Idempotency test passes, suite green | ✅ | 28/28 |
| CI runs typecheck + lint + test and passes | ⚠️ | Workflow is correct, and `pnpm run ci` passes from a scratch clone — but **it would have failed before the B3 fix**, and no runner has still ever executed it. |
| Everything committed | ✅ | 2 commits, 54 files |

**Phase 0 is complete.** The one caveat worth carrying forward is that no step has
touched real Cloudflare or Neon infrastructure — every check above is local.

---

## 4. WHAT EXISTS

### ADRs — all six roadmap gaps resolved

```
0001-platform.md               Workers + Neon + Better Auth + Resend; why not Vercel Hobby
0002-mvp-recut.md              Gap §0.2.1 — 14 features is not an MVP
0003-offline-sequencing.md     Gap §0.2.2 — offline contradiction
0004-system-config.md          Gap §0.2.3 — no config table
0005-analytics-events.md       Gap §0.2.4 — no analytics table
0006-character-art-pipeline.md Gap §0.2.5 — character art
0007-engineering-practice.md   Gap §0.2.6 — repo/test/CI/deploy practice
```

### Schema — 10 tables, migration `0000_progression_core.sql`

Progression core (8): `users`, `user_progression`, `xp_transactions`, `streaks`,
`streak_events`, `achievements`, `user_achievements`, `system_config`
Gap closures (2): `analytics_events`, `analytics_sessions`

Enums: `xp_source_type`, `locale` (`en`/`id`), `achievement_rarity`

Constraints that matter:

- `UNIQUE (user_id, source_type, source_id)` — the anti-double-credit constraint
- `created_at` index on the ledger, per roadmap §2.3's retention policy
- `CHECK (amount <> 0)` — a zero-XP row is always a bug
- `ON DELETE RESTRICT` on the ledger — survives account deletion as audit trail
- Append-only enforced by **trigger**, not convention
- Zero character/multiplier/bonus columns anywhere — enforced by a test

### Test suite — 28 tests, 2 files

Beyond the required idempotency test: 10× repeat, concurrent identical calls,
distinct sourceIds/users/sourceTypes, direct insert bypassing the service, config
re-read between awards, 5 config-failure modes, index existence by name, trigger
presence, DELETE rejection, RESTRICT behaviour, and a character-column scan.

Coverage: **100%** statements/branches/functions/lines on
`src/server/services/progression/**` (enforced threshold), 70% global floor.

### Infrastructure

| File | Notes |
|---|---|
| `open-next.config.ts` | Cloudflare Workers target. `buildCommand` guard (§1). `incrementalCache: "dummy"` + `routePreloadingBehavior: "none"`. |
| `wrangler.jsonc` | `compatibility_date` 2025-04-01, flags `nodejs_compat` + `global_fetch_strictly_public`, assets binding `.open-next/assets`. `"vars": {}` — secrets deliberately absent. |
| `.github/workflows/ci.yml` | lint → typecheck → test:coverage → build, then **free-tier invariant assertions** (greps for Neon `suspend` and hardcoded secrets). Has never executed against a real runner. |
| `README.md` | Prerequisites, setup, env-var contract, testing rationale, deploy story, honest known-gaps list. |

---

## 5. CHANGES MADE BEYOND THE THREE REQUESTED ITEMS

Flagged deliberately, because the commit contains them.

1. **`next.config.ts` — removed the `webpack` key.** Not requested. But `pnpm dev`
   was *broken*: Next 16 runs Turbopack by default and treats a `webpack` config as
   a misconfiguration, so every `next dev` exited with
   `⨯ ERROR: This build is using Turbopack, with a webpack config and no turbopack config.`
   Since "fresh clone → `pnpm dev` runs" is a Phase 0 exit criterion, this had to be
   fixed. The removed block only set dev-only `watchOptions.ignored` and a lighter
   source map; Turbopack honours `.gitignore` for watching, and `.open-next/`,
   `.next/`, `.wrangler/` are all gitignored. So nothing of value was lost.
2. **`scripts/seed.ts` — switched to the `pg` driver.** It used `neon-http`, which
   speaks Neon's HTTP protocol exclusively; given a plain `postgresql://` URL it
   tried `https://api.0.0.1/sql` and failed. Node-side tooling using TCP is exactly
   the split ADR 0001 §"Database drivers" describes.
3. **`scripts/seed.ts` — jsonb values emitted as quoted text literals.** `10::jsonb`
   fails on Postgres 17 (`cannot cast type integer to jsonb`); `'10'::jsonb` works
   for every type uniformly.
4. **Relative imports given explicit `.ts` extensions** across the schema modules.
   Node 22's native type stripping requires them, and `allowImportingTsExtensions`
   is already set. Without this `pnpm db:seed` could not run at all.

Items 2–4 predate this handoff and are called out only so the commit diff is not a
surprise. No test was weakened or deleted, no constraint touched, no suppressions
added.

---

## 6. EXPLICITLY NOT DONE

- No UI beyond the placeholder page (correct for Phase 0)
- No `projectProgression()` — Phase 2
- No level curve, streak logic, achievements evaluation — Phase 2
- No auth wiring. Better Auth is **decided (ADR 0001) but deliberately not installed** —
  check `package.json` before assuming it exists. `dependencies` holds only
  `@neondatabase/serverless`, `drizzle-orm`, `next`, `react`, `react-dom`, `server-only`.
- No i18n runtime — `locale` enum exists in schema only
- No character SVGs, no design tokens — Phase 1
- No PWA manifest/service worker — Phase 3 (deliberately deferred, ADR 0003)
- Never deployed. No real Cloudflare or Neon account created or touched.

---

## 7. KNOWN GAPS & CAVEATS

Honest list. None of these are blockers for Phase 1; all should be known before
Phase 3/4.

- **Never run against real Neon.** Only local Postgres 17.11 and PGlite. The
  vendor-specific layer (`neon-http` HTTP protocol, Hyperdrive binding, cold starts)
  is untested.
- **CI has never executed.** The workflow is written and locally equivalent steps
  pass, but no runner has ever run it. Push a branch to find out.
  *Update 2026-10-05:* the scratch clone found that CI **would** have failed on its
  first run (B3). That is fixed and the equivalent steps now pass from a clean
  checkout, but "passes locally in the same order CI uses" is still not the same
  as "a runner executed it". The remaining unknown is infrastructure-level only —
  `corepack prepare`, the pnpm cache, and Actions' own Node provisioning.
- **PGlite is single-connection**, so the idempotency test proves a *sequential*
  duplicate is rejected, not true simultaneity. The test file says so in its header.
- **`analytics_events` has no writer.** Tables and the D7 retention query exist
  (ADR 0005); emission is Phase 4. There is also **no retention/deletion policy** for
  telemetry, unlike the XP ledger — unlike the ledger, events lose analytical value
  once a cohort window has passed.
- **`compatibility_date` is `2025-04-01`**, the floor for automatic `process.env`
  population. Workerd warns it is behind. Bumping is safe and worth doing, but it is
  the one setting that can silently break `process.env`, so it should be a
  deliberate, tested change rather than a drive-by.
- **Two env files must stay in sync** (`.env.local` for Next/Node, `.dev.vars` for
  wrangler). Accepted cost of ADR 0001.
- **`favicon.ico` is still the create-next-app default.**
- **Roadmap gap:** ADR 0007 notes `pnpm dev` as unverified in its "revisit trigger"
  section. That is now stale — dev is verified (see §2).

---

## 8. NEXT ACTIONS

1. **Push a branch and let CI run end-to-end.** Never executed. The first attempt
   would have failed on typecheck (B3); that is fixed, so this is now a genuine
   unknown rather than a known-broken step.
2. **Verify against real infrastructure** when Neon + Cloudflare accounts exist:
   ```bash
   cp .dev.vars.example .dev.vars     # then fill in DATABASE_URL etc.
   pnpm run db:setup                   # migrate + seed against real Neon
   pnpm run preview                    # wrangler dev against the OpenNext build
   ```
   Confirm Neon scale-to-zero is enabled **on the actual project**, not merely absent
   from `wrangler.jsonc`.
3. **Then Phase 1** — design tokens, primitives, i18n scaffolding, six SVG characters.
   Roadmap risk #4 (characters reading as generic) is cheapest to fix now, at two
   days rather than six weeks.

### The scratch-clone check, worth repeating

This is the check that found B3, and it is cheap. Run it before believing any
"fresh clone → works" claim, including the ones in this file:

```bash
git clone <repo-or-remote> /tmp/lp-verify
cd /tmp/lp-verify && pnpm i --frozen-lockfile && pnpm run ci && pnpm run build:next
```

Delete the directory afterwards. It writes a full `node_modules`.

---

## 9. VERIFICATION COMMANDS

```bash
pnpm run lint           # expect exit 0, no output
pnpm run typecheck      # expect "Types generated successfully", then exit 0
pnpm run test           # expect 2 files, 28 tests passed
pnpm run test:coverage  # coverage report → coverage/index.html
pnpm run build          # expect exit 0; route table must show ○ /
pnpm run ci             # lint + typecheck + test

git log --oneline       # expect at least one commit
git status --porcelain  # expect empty
```

Note that `pnpm run ci` does **not** include `build`. The GitHub Actions workflow
does. Use `pnpm run build` locally to catch adapter-level problems — that is exactly
the class of failure B2 was, and `pnpm run ci` would not have caught it.

`typecheck` prints one line before it starts (`✓ Types generated successfully`)
and that is normal, not a warning. It is `next typegen` doing the work B3 required.

---

## 10. CONTEXT TO CARRY FORWARD

Non-obvious constraints that shape every future decision. Full reasoning lives in
`docs/adr/0001-platform.md` — read it before changing platform config.

- **Vercel Hobby is disqualified.** Its Fair Use Guidelines restrict Hobby to
  "non-commercial, personal use only," defining commercial broadly as any deployment
  used for financial gain of anyone involved in production. This PRD is explicitly
  commercial (PRD line 6, monetization §45). Vercel suspends accounts for this rather
  than billing, and Hobby cannot be paid past its caps. Cloudflare Workers Free
  permits commercial use.
- **Workers Free caps active CPU at 10 ms per invocation, excluding network I/O.** DB
  queries fit; heavy SSR does not. This is why the shell is static and the dashboard
  is a client island — an architectural driver, not an optimization. The escape hatch
  is Workers Paid at $5/month, which should be the first spend when revenue arrives.
- **Neon scale-to-zero must stay enabled permanently.** An always-on 0.25 CU database
  burns ~180 CU-hours/month against a 100 CU-hour allowance. Disabling it does not
  risk the limit, it guarantees exceeding it — with no traffic and no users involved.
- **`xp_transactions` is the source of truth.** `user_progression` is a derived cache.
  The Phase 2 acceptance criterion is that `projectProgression()` rebuilds the cache
  from the ledger — that is the proof the cache is disposable.
- **Characters grant no stats** (§8), enforced by a test that scans every column name.

---

*Phase 0 complete. Phase 1 unblocked, pending CI's first real run.*