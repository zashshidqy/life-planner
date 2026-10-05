# ADR 0001 — Platform

**Status:** Accepted
**Date:** 2026-10-05
**Applies to:** Everything after this

---

## Context

The PRD (§42) names a stack but leaves "infrastructure may use managed services"
(§42, closing line) open. Five decisions fall out of that: where the app runs,
where the data lives, how it is reached, how users are identified, and how
transactional email is sent.

The constraints that actually decide this are not technical preferences. They
are:

1. The product is **commercial**. PRD line 6 declares it a "Commercial
   Progressive Web Application" with FREE/PRO monetization (§45).
2. It must run on a **free tier** for a meaningful stretch, because there is no
   revenue yet.
3. It must be a **PWA** — installable, offline-capable, push-capable
   (DESIGN §36).

Constraint 1 is doing most of the work, and it eliminates the default choice.

## Decision

| Concern | Choice |
|---|---|
| Hosting | Cloudflare Workers (via `@opennextjs/cloudflare`) |
| Database | Neon Postgres, Free tier |
| ORM / runtime driver | Drizzle ORM over `neon-http` |
| Migration / CLI driver | Drizzle Kit over `pg` (Node only, never in the Worker) |
| Auth | Better Auth |
| Transactional email | Resend, Free tier |
| Package manager | pnpm |
| UI language | Bilingual `en` / `id`, user-selectable |

---

## Why not Vercel Hobby

**This is the section that will otherwise be re-litigated in six months, so it
gets the most detail.**

Vercel is the path of least resistance for a Next.js app. It is also
prohibited for this product.

Vercel's Fair Use Guidelines restrict Hobby teams to **"non-commercial, personal
use only."** It defines commercial broadly — as *any deployment used for the
purpose of financial gain of anyone involved in any part of the production of
the project.* Note what that covers: not just the operator's profit, but revenue
attributable to anyone upstream. A solo founder with a paid Pro tier in their app
is inside it. So is a project sponsored by a company.

PRD line 6 is unambiguous — "Commercial Progressive Web Application." PRD §45 is
a FREE/PRO pricing plan. This is the definition of prohibited use.

Three details make it worse than "don't do that":

- **Vercel suspends rather than bills.** Hobby accounts that hit a usage limit
  are paused, not charged. So the failure mode is losing access to the
  deployment, not paying for it.
- **Hobby cannot be paid past its caps.** There is no upgrade that retroactively
  legitimises the violation. The correct response is to move, not to pay.
- **The account risk is not project risk.** Suspension attaches to the account,
  which survives across projects. One violation can affect work that has nothing
  to do with this product.

Cloudflare Workers Free, by contrast, carries **no commercial-use restriction**,
allows 100,000 requests/day, and serves static assets free with no egress fees.

---

## Trap 1 — Neon scale-to-zero must stay enabled, permanently

Neon's Free tier allows **100 CU-hours per month**.

An always-on database on Neon's minimum 0.25 CU size consumes:

```text
0.25 CU × 720 h/month = 180 CU-hr/month
```

That is roughly **1.8× the free allowance**. Disabling scale-to-zero does not
merely risk exceeding the limit — it makes exceeding the limit *certain*, with
no traffic, no users, and no growth involved. The failure arrives on a billing
cycle, months after the mistake, attributed to nothing anyone did that week.

So: keep the Free plan's 5-minute idle scale-to-zero **on, always**.

The cost is a cold start of roughly 350 ms. That is invisible behind a PWA
loading state (DESIGN §39 explicitly prefers skeletons to spinners), and at
realistic usage — one to two active hours a day — the project lands around
8–15 CU-hr/month, comfortably inside budget.

Practical consequence: **do not** write anything that requires a warm connection.
That is one of the reasons the architecture is static-shell (below) rather than
server-rendered per request.

## Trap 2 — Workers Free caps active CPU at 10 ms per invocation

Cloudflare's 10 ms limit applies to **active CPU time**, and this distinction is
the single most consequential fact in this ADR.

**Time spent waiting on the network is not CPU time.** Awaiting a Neon query does
not consume the budget. So a Worker that issues two indexed queries and returns
JSON is comfortably inside 10 ms — the wait is free, the JSON parsing is not.

What does **not** fit is server-side rendering of a substantial page. Rendering a
dashboard with a dozen components costs real CPU in the isolate, and it costs it
on **every request, for every user**, including repeat visitors who could have
been served a static file.

This is the trap because it is invisible until traffic arrives. Development on a
laptop never shows it; the 10 ms limit only appears under real load, at which
point the fix is an architectural change, not a tuning change.

### Decision it drives: static shell, client render, thin authoritative writes

```text
Static app shell        →  Workers static assets     0 CPU, 0 counted requests
Client-rendered views   →  fetches in the browser     0 CPU
Authoritative writes    →  one indexed read + one insert    small CPU
```

Rules that follow, and that later phases are reviewed against:

- Server functions stay under ~50 lines and issue a **bounded number of indexed
  queries**.
- **No** server-side aggregation over large tables.
- **No** SSR of the dashboard. If a page needs more than a shell plus a client
  fetch, it belongs on the client.
- The dashboard route must stay `○ (Static)` in `next build` output. If it ever
  flips to `ƒ (Dynamic)`, that is a regression against this ADR, not a detail.

This happens to be the shape the product wants anyway (DESIGN §47: progress
should be visible; the dashboard is a client island over cached data), so the
constraint and the design goal agree. That is worth stating plainly — the
architecture is not compromised by the limit, it is shaped by it.

### The escape hatch

Workers Paid is **$5/month** and removes the 10 ms CPU ceiling entirely. It is
the cheapest available unlock and should be the **first** thing bought when real
revenue arrives. Neon Launch is the second.

This matters because it means the constraint is temporary and we know exactly
what releases it. A limit with a known $5 exit is a design input. A limit with no
exit is a crisis.

---

## Schema scope

Only the **progression core** is migrated in Phase 0 — eight tables plus the two
analytics tables that close roadmap gaps §0.2.3 and §0.2.4. PRD §38 lists forty.

The forty-table plan is the right *destination*. Writing it now would be wrong:

- The progression core is the only part that must be correct before anything can
  be built on it. The ledger, the level cache, the streak record, and the config
  everything else reads come first because everything else is downstream of them.
- The constraint that must never be retrofitted —
  `UNIQUE (user_id, source_type, source_id)` on `xp_transactions` — is in a file
  here. Adding it later means deduplicating a live table and arbitrating which
  duplicate to keep. That is a data project, not a migration.
- Thirty speculative tables produce migrations that get rewritten in the phase
  that actually needs them, and every one of those rewrites is a chance to
  introduce a defect nobody was looking for.

Auth tables (`user`, `session`, `account`, `verification`) are owned by Better
Auth and are created in the phase that wires auth.

### `users` and Better Auth

`users.id` **is** the auth provider's user id. There is no surrogate key and no
second id to keep in sync. `users` stores no email and no password material —
those live in exactly one place, so there is never a question of which copy is
current and an erasure touches one row. `id` is `text`, not `uuid`, so adopting a
social login that issues its own subject id needs no migration.

---

## Database drivers — three, each confined to one job

| Job | Driver | Why |
|---|---|---|
| Application runtime | `neon-http` | Workers has no TCP sockets. Every query is a fetch. |
| Migrations & CLI | `pg` | DDL such as `CREATE INDEX` cannot run through Neon's transaction-mode pooler. Runs on a dev machine or CI, never in the Worker. |
| Unit tests | PGlite | Real Postgres in-process. No container, no connection string. See ADR 0007. |

Three drivers is more than a phase-one project strictly needs. The alternative —
one driver everywhere — was rejected because each of the other two does not work
at all in at least one of those three places. `pg` cannot run in a Worker, full
stop. `neon-http` cannot reach a local Postgres. The cost is one alias function,
`extractRows`, which normalises the raw-result shape and is directly tested.

## Transactions

`neon-http` speaks the single-statement HTTP query protocol, so
`db.transaction()` is unavailable. This is a real constraint, not an oversight.

Nothing in Phase 0 needs one: the append-only ledger makes each `awardXp()` call a
single self-contained statement, which is *why* that design was chosen — a
transaction-free write is also a race-free write. The first feature that needs
multi-statement atomicity (the `projectProgression()` rebuild) will either take
the WebSocket driver or be written as an idempotent, retryable operation. Recorded
here so it is discovered at design time rather than halfway through an
implementation.

## Cache strategy

`incrementalCache: "dummy"`, with a comment saying why.

The architecture has nothing to revalidate: the shell is static, the dashboard is
a client island, writes are thin and authoritative. A real incremental cache
would be an unused resource that still costs a binding, a bucket, and a class of
failure mode.

The available replacements, when the first feature that needs one arrives:

- `static-assets-incremental-cache` — serves prerendered output straight from the
  static-assets directory. Still 0 CPU and 0 counted requests. **This is the
  intended choice**, because the architecture forbids revalidation.
- `regional-cache` — in-isolate memory. Also 0 requests.
- `r2-incremental-cache` — adds an R2 bucket and a read per lookup. **Avoid**
  unless something genuinely revalidates.

## Images

`images.unoptimized: true`. The `images` binding is a paid Cloudflare add-on and
the app has no image processing requirement. Phase 1 revisits this when the
character SVGs and share cards exist.

## `process.env` on Workers

There is no ambient process environment on Workers; every value arrives as a
binding. With `nodejs_compat` and a `compatibility_date` of `2025-04-01` or
later, Cloudflare populates `process.env` from bindings automatically — so
application code reads `process.env.DATABASE_URL` unchanged in dev, build, and
production.

The consequence is that every secret must be a Worker secret, set with
`wrangler secret put`. A secret placed in `wrangler.jsonc`'s `vars` block is
plaintext in git and will eventually leak. `wrangler.jsonc` in this repository
has an empty `vars`.

Locally the same names come from `.dev.vars` (read by wrangler and the OpenNext
dev proxy) and `.env.local` (read by `next build` and the Node-based tooling).
`.env.example` and `.dev.vars.example` are committed; the files they stand in for
are not.

## Consequences

**Accepted:**

- Cold starts on the first request after 5 idle minutes (~350 ms).
- No multi-statement transactions from the Worker.
- Dashboard cannot be SSR'd. First paint is client-side, mitigated by a PWA
  loading state.
- Two files must stay in sync for env vars (`.env.local` and `.dev.vars`).

**Accepted as the right trade at zero revenue, revisitable when there is some:**

- The 10 ms CPU ceiling constrains server-side work until Workers Paid is bought.
- Neon scale-to-zero is non-negotiable. If someone needs a warm database, that is
  a business decision (buy Neon Launch), not an infrastructure toggle.

**Rejected, and why, so the question stops recurring:**

- **Vercel Hobby** — prohibited for a commercial product (above).
- **Vercel Pro** — $20/month before any traffic. Possible, but it buys Headroom
  the free Workers tier plus a $5 tier already provides at a quarter of the price,
  and it reintroduces the account-suspension risk the ADR exists to avoid.
- **Supabase / Railway / a self-managed Postgres** — the free tiers do not permit
  commercial use either, and self-hosting adds an operator to a one-person team.
- **D1 (Cloudflare's own SQLite)** — attractive for zero-latency, but PRD §38
  specifies PostgreSQL and the `jsonb` columns in `analytics_events` and
  `system_config` would need rewriting.
- **Prisma** — heavier runtime and a larger client bundle on a runtime with a CPU
  budget measured in milliseconds. Drizzle emits SQL you can read and index.