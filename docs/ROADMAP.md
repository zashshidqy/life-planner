# LIFE PLANNER — Build Roadmap

**Created:** 2026-10-05
**Repo state at time of writing:** `docs/PRD.md` (1360 ln) + `docs/DESIGN.md` (1200 ln) only. No code, no git repo.
**Status:** Plan approved for Phase 0 → Phase 1. Phases 2+ are provisional until Phase 1 exit criteria pass.

> **Where this stands now.** This file used to live at
> `~/.opencode/plan/LIFE_PLANNER_ROADMAP.md`, outside the repository, where a model
> working on any other machine could not read it. It now lives here.
>
> **Phase 0 is complete** — see [`STATUS.md`](STATUS.md) for the verified exit-criteria
> scorecard and the constraints to carry into Phase 1. Phase 1 is the current phase.
>
> Two things below are historical and were superseded during Phase 0. Read them as
> record, not instruction:
>
> - The header's "no code, no git repo" describes the repo *at time of writing*.
> - §PHASE 0 lists three ADRs (`0002-auth.md`, `0003-analytics.md`). The gaps were
>   actually closed by **seven** ADRs with different names — see [`adr/`](adr/README.md).
>   The §0.2 gap numbering the real ADRs cite is still accurate.

---

## 0. SITUATION ASSESSMENT

The specification is unusually complete. Both documents are internally consistent and make several genuinely
good decisions that should be protected as hard architectural rules for the life of the project.

The gap is not vision. It is **sequencing**. Neither document says what to build first, in what order, or how to
know a phase is done. This roadmap supplies that.

### 0.1 Rules inherited from the PRD (do not violate)

| Rule | Source | Consequence in code |
|---|---|---|
| XP / level / streak computed server-side only | §11, §12, §13 | Client never derives progression. It renders it. |
| XP stored as append-only `xp_transactions` ledger | §39 | No `users.xp` counter as source of truth. Counters are derived caches. |
| Characters grant zero stat effect | §8 | No per-character multiplier may exist anywhere in the codebase. |
| Design tokens centralized | DESIGN §43 | No inline magic values. Tokens are the only source. |
| Domain logic separate from UI | §43 | `server/` holds rules. `features/` holds rendering. |
| Attributes are motivational, never medical | §19, §26 | No diagnostic language anywhere in copy. |
| Gamification must not create anxiety | DESIGN §48 | Streak loss is never punishing-ugly. Grace days are default, not opt-in. |

### 0.2 Gaps identified in the current spec

These are real contradictions in the existing docs. Each needs a decision, marked **[UNRESOLVED]** below.

1. **MVP is not MVP-sized.** §46 lists 14 features including PWA, Calendar, Goals, Habits, Achievements. This
   contradicts §46's own closing line ("Jangan membangun seluruh feature set sekaligus"). This roadmap re-cuts it.
2. **Offline contradiction.** §36 places offline + IndexedDB inside MVP. §37 states conflict resolution must be
   designed *before* full offline implementation. Neither is sequenced. Offline sync is the single largest
   engineering risk in this spec and is currently scheduled into the first release.
3. **Configurable-everything has no schema.** §11 (XP values), §13 (level curve), §45 (pricing/limits), §44
   (system config, feature flags) all require server-side config. §38's 40-table list contains no config table.
4. **Metrics with no telemetry.** §49 requires DAU/WAU/MAU and D1/D7/D30 retention. §38 has no analytics table.
   The success criteria as written cannot currently be measured.
5. **Character art pipeline is unplanned.** §8 needs 6 characters, §15 requires legibility from 32px to 512px.
   No source, no scope, no budget. This is the classic hidden blocker — the product's entire identity waits on it.
6. **No ADRs, no README, no local-dev instructions, no testing/CI/deploy story.**

---

## 1. LOCKED DECISIONS

Confirmed with product owner, 2026-10-05.

| Decision | Choice | Rationale |
|---|---|---|
| Hosting (year 1) | **Cloudflare Workers** | Only free tier that permits commercial use. See §2. |
| Database | **Neon Postgres (Free tier)** | Real Postgres as §38 requires. 0.5 GB, 100 CU-hr/mo. |
| ORM / driver | Drizzle ORM via `neon-http` + Hyperdrive | Verified to work on Workers runtime. |
| Auth | **Better Auth** | MIT, runs on Workers, no per-MAU pricing cliff later. |
| Transactional email | **Resend free tier** (3,000/mo) | Covers §6 verification + reset at year-1 volume. |
| Characters | **Hand-authored parametric SVG React components** | Infinitely scalable — satisfies §15 by construction. No art dependency, unblocks Phase 1. |
| UI language | **Bilingual, user-selectable** (`en` / `id`) | Adds i18n layer in Phase 1 rather than retrofitting. |
| Package manager | pnpm | Faster, better monorepo ergonomics than npm. |

### 1.1 Why not Vercel Hobby

It is the obvious default and it is **wrong for this product**. Vercel's Fair Use Guidelines restrict Hobby teams to
"non-commercial, personal use only," defining commercial broadly as *any deployment used for the purpose of
financial gain of anyone involved in any part of the production of the project.* PRD.md line 6 declares this a
"Commercial Progressive Web Application" with FREE/PRO monetization (§45). That is the definition of prohibited use,
and Vercel pauses accounts for it rather than billing. Hobby also cannot be paid past its caps — exceeding a limit
pauses the feature for up to 30 days.

Cloudflare Workers Free carries **no commercial-use restriction**, allows 100,000 requests/day, and serves static
assets free and unlimited with no egress fees.

---

## 2. FREE-TIER ENVELOPE — WHAT ACTUALLY FITS

This section exists because "free tier" hides traps that will surface at the worst moment if not designed for now.

| Resource | Free allowance | Design implication |
|---|---|---|
| Workers requests | 100,000 / day | Ample. ~3,000 MAU with typical PWA usage. |
| Static assets | Unlimited, no egress | PWA shell, fonts, characters, share-card assets all free. |
| Workers CPU | **10 ms per invocation** | ← **The binding constraint.** See below. |
| Neon storage | 0.5 GB | Journal + ledger. ~55 MB/year of `xp_transactions` at 100 users. Multi-year runway. |
| Neon compute | 100 CU-hr / month | ← **Second binding constraint.** See below. |
| Resend email | 3,000 / month | Year-1 headroom is ample. |

### 2.1 The 10 ms CPU limit is a design driver, not an inconvenience

Workers Free caps **active CPU time** at 10 ms per invocation. Critically, this excludes network I/O wait — time
spent awaiting Neon is not CPU time. A Drizzle query returning JSON is comfortably inside budget.

What does *not* fit is heavy server-side rendering of a large dashboard. This pushes the architecture toward
exactly the shape the product wants anyway:

```text
Static app shell on Workers static assets      (0 CPU)
Client-rendered dashboard, reads from cache    (0 CPU)
Thin server actions for authoritative writes   (small CPU — one indexed query + one insert)
```

**Rule:** any server function must stay under ~50 lines and issue a bounded number of indexed queries. No
server-side data aggregation over large tables. No SSR of the dashboard. If a page needs more than a shell and
a client fetch, it belongs on the client.

### 2.2 Neon scale-to-zero MUST stay enabled

This is a trap worth stating explicitly. An always-on database on Neon's minimum 0.25 CU consumes **187.5 CU-hours
per month — nearly double the 100 CU-hour free allowance.** Disabling scale-to-zero does not merely risk the limit;
it guarantees exceeding it.

Keep the free plan's 5-minute idle scale-to-zero permanently on. At realistic usage (~1–2 active hours/day) the
project lands around 8–15 CU-hr/month, comfortably inside budget. Cold start is ~350 ms, which is invisible behind
a PWA loading state.

### 2.3 `xp_transactions` needs an archive policy from day one

The ledger (§39) is append-only and grows forever. At ~10 XP events/day/user and 100 users that is ~365,000 rows/year.
Not urgent, but the table should be designed with a `created_at` index and an explicit retention decision before it
becomes the slowest table in the database.

### 2.4 Exit ramp

Free tiers here are permanent at low scale, not 30-day trials. When real revenue arrives, **Cloudflare Workers
Paid at $5/mo** removes the 10 ms CPU ceiling entirely. That is the single cheapest unlock available and should be
the first spend. Neon Launch is the second.

---

## 3. PHASE PLAN

Exit criteria are pass/fail. Do not begin the next phase until the current one passes.

### PHASE 0 — Repo & Decisions  ·  ~1 day

- `git init`, `.gitignore`, `.editorconfig`, `.env.example`
- `README.md` with local-dev setup, prerequisites, seed instructions
- Three ADRs under `docs/adr/`: `0001-platform.md`, `0002-auth.md`, `0003-analytics.md`
- Resolve the six gaps in §0.2 — write answers into ADRs, not into code comments
- CI: typecheck + lint + test on every push

**Exit:** fresh clone → `pnpm i && pnpm dev` → working empty app. Every §0.2 gap has a written decision.

---

### PHASE 1 — Design System Spine  ·  ~2–3 days

Build the vocabulary before the sentences.

- Tailwind v4 theme tokens from DESIGN §5–9 and §43: colors, spacing, typography scale, radius tiers, border
  weights, shadow set (offset only, 4px/6px/8px), motion durations (150–200 / 250–350 / 400–600 ms)
- Neo-brutalist primitives with **all seven states defined before implementation** (DESIGN §44):
  default, hover, active, focus, disabled, loading, success, error
- Motion primitives honoring `prefers-reduced-motion` (DESIGN §41)
- **i18n scaffolding** — `en` + `id` locale routing, typed message keys. Retrofitting this costs 3–5× more.
- **Six parametric SVG characters** as React components. Each must render legibly at 32 / 64 / 128 / 512 px (§15).
  Verified by rendering each size and checking visually, not by assuming.

**Exit:** a component gallery route renders every primitive in every state at all breakpoints; characters verified
at all four sizes; switching locale updates every string with no hardcoded copy anywhere.

> **Note:** bilingual is not cosmetic here. Indonesian copy runs materially longer than English. The DESIGN §10 hero
> ("Ready to make today count?") and the §18 LEVEL UP sequence must be re-checked at ID lengths or the neobrutalist
> layout will break. Test with longest strings, not placeholders.

---

### PHASE 2 — Progression Engine  ·  ~3–5 days  ·  **← CORE**

The most expensive thing to retrofit is therefore built first, in isolation, fully tested.

**Schema (progression core only — not all 40 tables):**

```text
users              progression state
user_progression   level, current_xp, lifetime_xp  (DERIVED CACHE — not truth)
xp_transactions    append-only ledger  ← THE SOURCE OF TRUTH
streaks            current_streak, longest_streak, last_active_date
streak_events      per-day activity record
achievements       definitions
user_achievements  unlock records
system_config      ← closes gap §0.2.3; XP values, level curve, caps, feature flags
```

**Pure functions + vitest:**

| Function | Contract |
|---|---|
| `awardXp()` | Idempotent. Unique constraint on `(user_id, source_type, source_id)` makes double-credit impossible. |
| `levelFor()` | Curve read from `system_config`. Never hardcoded (PRD §13). |
| `applyStreak()` | Grace-day aware. Activity-based, never app-open based (§16). |
| `enforceDailyCap()` | Anti-farm ceiling (§12). |
| `projectProgression()` | Rebuilds `user_progression` from the ledger. Proves the cache is disposable. |

The last one matters most: if the projection can always be rebuilt from the ledger, the ledger is trustworthy and
the cache is merely an optimization. That property is the whole point of §39.

**Exit:** 100% branch coverage on `server/services/progression/*`. A test asserts that replaying an identical
`awardXp` call twice yields one ledger row. `projectProgression()` reproduces `user_progression` byte-for-byte.

---

### PHASE 3 — Vertical Slice: Prove the Loop  ·  ~1–2 weeks

The product *is* the loop: `Plan → Earn XP → Level Up → Streak → Achievement`. Build it with **one** activity
type, end to end, then generalize.

```text
Register / login
  → Onboarding-lite (username + character select)
  → Dashboard (LEVEL · XP bar · streak · today's progress)
  → Tasks (create, list, complete)
  → complete triggers:
        xp_transactions INSERT  (idempotent)
        → projection update
        → level-up / achievement unlock
        → toast "+25 XP"  →  LevelUpModal if applicable
```

- PWA shell only: manifest, icons, service worker. **Offline read-only. No write queue yet** (see below).
- Daily quests in their simplest form — derived from today's tasks, no separate authoring UI.

**Exit:** a real user registers, picks a character, completes a task, watches XP land, levels up, and installs the
PWA to their home screen. Works on a real phone on a real network.

> **Why offline writes wait.** §37 states conflict resolution must be designed before full offline implementation.
> Building an IndexedDB write queue without a settled conflict strategy produces silent data loss that is far more
> expensive to debug than a missing feature. Offline reads prove the PWA works. Offline writes come in Phase 4 with
> the design doc already written.

---

### PHASE 4 — Harden & Widen  ·  ~2–3 weeks

- Rate limiting, audit logging, ownership enforcement on every user-owned record (§40)
- Tune `enforceDailyCap` against **real abuse data**, not imagined attacks
- Goals, Habits, Calendar — thin, single-purpose implementations
- **Analytics events table** → closes gap §0.2.4. Without it §49's success metrics cannot be computed at all.
- Conflict-resolution design doc → **then** offline write queue and sync
- Watchlist: if Workers CPU or Neon CU-hours approach their ceilings, this is the phase where $5/mo Workers Paid
  gets budgeted

**Exit:** abuse resistance tested by an actual adversarial script. Retention funnel queryable in SQL. Offline writes
survive a forced conflict without data loss.

---

### PHASE 5 — V1  ·  (per PRD §47)

Projects · Routines · Focus · Journal · Personal Records · Share Cards · Public Profile · Notifications

V2 (§48) — AI features, subscription, premium cosmetics — is out of scope for this roadmap.

---

## 4. RISK REGISTER

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Progression system turns out unsatisfying in practice | **High** | Phases 2–3 front-loaded so this surfaces in week ~3, not month 5 |
| 2 | 10 ms CPU ceiling forces architecture compromise later | Medium | Rule in §2.1 enforced from Phase 2. $5/mo Workers Paid is the escape hatch |
| 3 | Neon compute overrun | Medium | Scale-to-zero stays on, always (§2.2) |
| 4 | Character SVGs read as generic rather than distinctive | Medium | Six distinct silhouettes + palettes. Iterate in Phase 1 while cost is 2 days, not 6 weeks |
| 5 | Bilingual strings break neobrutalist layouts | Medium | Test longest-case strings from day one (§Phase 1 note) |
| 6 | i18n retrofit cost | Low | Mitigated by doing it in Phase 1 |
| 7 | Scope creep back toward full §46 MVP | Medium | This document. Exit criteria are pass/fail |
| 8 | Journal content is sensitive; admin access is a legal question | Medium | §44 already restricts it. Enforce in schema, not policy docs |

---

## 5. FIRST CONCRETE ACTIONS

1. `git init` + `.gitignore` + `.env.example` + `README.md`
2. Scaffold Next.js + TypeScript + Tailwind v4 + pnpm
3. Write `docs/adr/0001-platform.md` recording the Workers/Neon/Better Auth choices **and the reasoning above** —
   the "why not Vercel" note must survive, or it will be re-litigated in six months
4. Add `system_config` and `analytics_events` to the schema plan (§0.2.3, §0.2.4)
5. Set up CI: typecheck + lint + vitest

---

*End of roadmap. Phases 2+ provisional pending Phase 1 exit criteria.*
