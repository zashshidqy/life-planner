# Architecture

Five invariants. Everything else in this repository is negotiable; these are not.

Each entry states the rule, why it exists in one line, **how it is actually
defended** (so you know whether a change you are about to make will fail CI, fail
a test, or only fail review), and what breaking it looks like in practice.

This document does not restate the PRD. [`PRD.md`](PRD.md) is authoritative for
what the product is; [`DESIGN.md`](DESIGN.md) for how it looks; and an ADR is the
authority for any decision's reasoning. This file exists to make the expensive
mistakes *before* they are made, and it is deliberately short — if it grows past
this, the reasoning belongs in a new ADR instead.

---

## 1. The ledger is the truth; `user_progression` is a disposable cache

**Rule.** All XP enters through `xp_transactions`, which is append-only.
`user_progression` holds a level, current XP, and lifetime XP that are *derived*.
Read a level from the projection if you like, but never write one from anything
except a rebuild, and never let a cached number decide an award.

**Why.** PRD §39 — a mutable `users.xp` counter cannot be audited and cannot be
trusted, so XP is an append-only event log and every total is a sum over it.

**Defended by.**
- Database: a `BEFORE UPDATE OR DELETE` trigger on `xp_transactions` raises on any
  mutation, and `ON DELETE RESTRICT` from `users` keeps the audit trail intact
  across account deletion. Verified against real Postgres — see `STATUS.md`.
- **Pending, Phase 2:** the proof that matters — `projectProgression()` rebuilding
  `user_progression` byte-for-byte from the ledger. Until that test exists, the
  cache is *believed* disposable rather than *proven* disposable. Do not treat
  this invariant as mechanically enforced yet.

**If you break it.** Level-up logic reads a cache, the cache drifts, and the drift
is invisible because every individual read looked fine. Retrofitting means
reconciling two sources of truth against each other with real users' data. This is
the single most expensive mistake available in this codebase, and it is entirely
invisible until it is made.

**ADR.** [0001-platform.md](adr/0001-platform.md) §Cache strategy, §Transactions.

---

## 2. Characters grant zero mechanical effect

**Rule.** Characters are identity and personalisation. No character may have an XP
multiplier, a streak bonus, a stat, or any other mechanical advantage. Cosmetic
unlocks gated behind level, achievement, milestone, or subscription are exactly
right. Anything that changes a number is wrong.

**Why.** PRD §8 — all characters must have equal ability; the point of the system
is identity, not a power ranking dressed as one.

**Defended by.** A test, not a convention. It scans every column in the progression
core for names containing `character`, `multiplier`, `bonus`, `boost`, or
`xp_rate` and fails if any exist — see `award-xp.test.ts`, "has no character-stat
column anywhere in the progression core". Adding such a column breaks CI. Adding
the multiplier *in application code* does not, which is why the test is a column
scan and not a complete solution: review is still the second line of defence.

**If you break it.** This is the mistake a competent model makes confidently,
because "a small bonus for the rarer character" feels like obvious good game design
and is exactly what the PRD forbids. It also corrodes the product's central claim:
that progression reflects real activity. Once characters affect numbers, XP stops
measuring the user's life and starts measuring their avatar choice, and the level
becomes meaningless as an identity.

**ADR.** [0006-character-art-pipeline.md](adr/0006-character-art-pipeline.md);
PRD §8, §9.

---

## 3. Progression is computed server-side only

**Rule.** The server computes XP, level, and streak. The client renders what it is
told. Never derive progression in the browser, never accept an XP amount, a level,
or a `user_id` from a request, and never trust the client to enforce a cap.

**Why.** PRD §11–13 (server-side XP and level curve), §40 (never trust a
`user_id` from the client), §41 (all business-critical logic is server-side).

**Defended by.**
- Structural: `src/server/**` imports the `server-only` package, so a server module
  pulled into a client bundle fails the build rather than shipping secrets to the
  browser. `awardXp()`'s signature has **no `amount` parameter** — a client cannot
  express an arbitrary payout even if it tampers with the request.
- **Review-enforced.** Nothing tests "the client did not compute a level." Keep
  client modules free of progression maths.

**If you break it.** Every user can edit their own progression. A client-side level
curve also means the curve exists in two places and drifts the first time the
config changes.

**ADR.** PRD §11–13, §40, §41; `README.md` §Conventions.

---

## 4. The app shell stays static; the Worker budget is 10 ms of CPU

**Rule.** The shell is served as static assets, views are client-rendered, and
writes are thin and authoritative — one indexed read plus one insert. No
server-side aggregation over large tables, no SSR of the dashboard. The dashboard
must appear as `○ (Static)` in `next build` output.

**Why.** Workers Free caps *active CPU* at 10 ms per invocation, excluding network
wait — so awaiting Neon is free and rendering is not. SSR does not fit, and the
constraint is invisible until traffic arrives, at which point the fix is
architectural rather than a tuning change.

**Defended by.**
- `pnpm run build:next` prints the route table; `○` → `ƒ` is a regression. CI runs
  the full build, and the free-tier invariant step greps `wrangler.jsonc` for a
  disabled `suspend` (Neon scale-to-zero) and for secrets in the plaintext `vars`
  block.
- **`pnpm run ci` does not include a build** — the architecture check is separate
  and easy to skip. Run `build:next` when touching rendering.
- The escape hatch is Workers Paid at $5/month, which removes the ceiling
  entirely. Until that is bought, treat 10 ms as fixed.

**Three database drivers, each confined to one job.** This is deliberate and looks
like duplication until you try to collapse it: `neon-http` in the Worker (no TCP
sockets on Workers), `pg` for migrations and CLI (DDL cannot run through Neon's
transaction-mode pooler, and `pg` cannot run in a Worker at all), and PGlite for
tests (real Postgres in-process, so the suite needs no container or credentials).
Also note `db.transaction()` is unavailable under `neon-http`; nothing in Phase 0
needs one, and the first feature that does must solve it deliberately.

**If you break it.** The dashboard gets a little heavier each time someone adds a
server-side convenience. Nothing fails until real traffic, then everything fails at
once and the fix is to move rendering to the client.

**ADR.** [0001-platform.md](adr/0001-platform.md) Trap 1 and Trap 2 — the "why not
Vercel" section in the same file must survive, or it will be re-litigated.

---

## 5. Tunable values live in `system_config`, never in code

**Rule.** XP amounts, the level curve, daily caps, feature limits, and pricing are
database rows. `awardXp()` resolves the payout from `xp.award.<source_type>` and
throws if the row is absent or unusable.

**Why.** PRD §11 and §13 require server-side configurability; ADR 0004 records
that PRD §38's forty-table list had no config table at all, which made four
separate requirements unimplementable.

**Defended by.** Tests covering the missing-row, wrong-type, non-integer,
zero, and negative cases. `awardXp()` has no fallback value on any path: a
missing config row throws rather than awarding zero, because a silently-zero award
is indistinguishable in the product from the feature being broken, and a hard
failure is found in development instead of in a support ticket.

**If you break it.** A `switch` statement of XP values appears, then the config
table stops matching reality, and changing a payout requires a deploy. It also
re-opens XP abuse (PRD §12), which is exactly what the caps exist to prevent.

**ADR.** [0004-system-config.md](adr/0004-system-config.md); roadmap gaps §0.2.3
and §0.2.4.

---

## Layout, briefly

`src/server/` holds rules. `src/app/` and, from Phase 1, `src/features/` hold
rendering. Domain logic and UI stay apart (PRD §43). The only progression code
that exists today is `src/server/services/progression/award-xp.ts`; the test
suite requires **100% branch coverage** under that directory, so new code there is
written test-first rather than retrofitted.

## Superseding

An invariant changes only by superseding its ADR, never by editing this file to
match new code. If you think an invariant is wrong, that is an ADR-sized argument:
write the new record, mark the old one `Superseded by ADR-NNNN`, and update the
pointer here. See [`adr/README.md`](adr/README.md) §Format.