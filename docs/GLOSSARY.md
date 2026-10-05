# Glossary

Domain terms, and — more importantly — the ones that are easy to get wrong. A
general-purpose model will guess these from their names, and the guesses are
plausible enough to survive review while producing a domain model that cannot
represent the product.

Every definition points at its authority. [`PRD.md`](PRD.md) is authoritative for
the product; where this file and the PRD ever disagree, the PRD wins and this file
is the bug.

**Nothing in the first two groups has a table yet.** The Phase 0 schema is ten
tables: `users`, `user_progression`, `xp_transactions`, `streaks`,
`streak_events`, `achievements`, `user_achievements`, `system_config`,
`analytics_events`, `analytics_sessions`. There is no `tasks` table, no `habits`
table, no `quests` table. See [`STATUS.md`](STATUS.md) §6.

---

## The four that get conflated

These four are the most expensive to confuse, because each is a *different kind of
thing* that happens to sound like a checklist item. PRD §14, §22, §24, §25.

| Term | What it actually is | What it is **not** |
|---|---|---|
| **Quest** | A goal scoped to **one day**, derived from that day's tasks, habits, goals, routines, or focus work. Resets every day. | A durable object the user authors and keeps. Per the roadmap, Phase 3 quests are *derived* from today's tasks with **no separate authoring UI** — so do not build a `quests` table. |
| **Task** | A single completable unit with `status`, `priority`, `due_date`, `scheduled_start`/`_end`, `estimated_duration`, `completed_at`, and optional subtasks. Belongs to a project. | A repeating measure. A task is done once. |
| **Routine** | An **ordered sequence** of activities — `items`, `order`, `duration`, `schedule`. A container, not a unit of work. | A single measurable thing. Completing a routine means completing its items in order; the routine itself is not one checkbox. |
| **Habit** | A **recurring measurement** — `frequency`, `target`, `measurement`, `schedule`. `measurement` is Boolean, Count, Duration, or Quantity ("Read / 20 pages", "Water / 2 liters"). | An ordered sequence. Habits have no `order` and no notion of partial completion beyond their measurement. |

The one-sentence version: **task = do once, habit = measure repeatedly, routine =
ordered group of steps, quest = today's derived target.**

## Progression

**Ledger** — `xp_transactions`, the append-only event log that is the source of
truth for all XP (PRD §39). Not a counter. There is no `users.xp` and there will
not be one. Every total is a sum over the ledger. Append-only is enforced by a
database trigger: a correction is a **new row with a negative amount**, never an
edit or a delete.

**Cache** — `user_progression`, holding level, current XP, and lifetime XP. Purely
derived. It exists so you do not sum the whole ledger on every page view, and it
must stay rebuildable from the ledger at all times. If a value in the cache
disagrees with the ledger, **the ledger is right and the cache is a bug.**

**Current XP** — progress toward the *next* level. PRD §10's `2,840 / 3,500 XP`.

**Lifetime XP** — the monotonic running total from the ledger, never reduced. This
is the number on a share card (PRD §30's `18,420 LIFE XP`).

**Level** — derived from the curve in `system_config`, never hardcoded (PRD §13).
Level is a *primary identity* for the user, which is why it must be earned only by
real activity. XP is not spendable: there is no currency sink, and XP does not
decay.

**`source_type` / `source_id`** — the idempotency key. `(user_id, source_type,
source_id)` is unique in the ledger, and that constraint is what makes double-credit
impossible under concurrency. `source_id` is the id of the specific real-world
activity (a task row id). **It must be stable across retries** — a retry that
supplies a different `source_id` will be credited as a new event.

**XP award vs XP correction** — an award has a positive amount and an implicit
reason. A correction is a negative row with an explicit reason, written through a
dedicated admin path that does not exist yet. `awardXp()` has no `amount`
parameter, so an arbitrary operator-chosen payout cannot be expressed through it at
all.

**Character** — an identity and visual representation (PRD §8). Grants **zero**
mechanical effect. No multiplier, no stat, no bonus, ever. Cosmetic unlocks are
correct; anything that changes a number is forbidden. See
[`ARCHITECTURE.md`](ARCHITECTURE.md) §2.

## Streaks, attributes, records

**Streak** — consecutive days of *meaningful activity*, explicitly **not** app
opens (PRD §16). The primary streak is a main piece of user identity. There are
milestones (7/30/60/100/365 days, PRD §17) and a recovery/grace mechanism (PRD
§18) whose stated goal is "encourage returning, not punish absence." Losing a
streak must never be presented punitively.

**Attribute** — Health, Productivity, Learning, Discipline, Wellbeing, Finance
(PRD §19). Computed from related activity. **Informational and motivational only.**
Must never be presented as a medical or psychological measurement (PRD §19, §26).
A model asked to "show the user's Health score" will happily build something that
reads like a diagnosis; that copy is a product bug, not a copy bug.

**Personal Record** — a high-water mark compared against **the user's own history
only** (PRD §29, and PRD §3.3 self-competition). Never compared to other users.
This applies across the product: no leaderboards, no social ranking.

**Daily progress** — a percentage of *planned* activities completed (PRD §15), not
a measure of effort or hours.

## Structure

**Goal** — a named outcome with `category`, `deadline`, `progress`, `milestones`,
`status`. Owns projects, tasks, habits, and milestones (PRD §20).

**Project** — sits under a goal or stands alone; holds tasks, milestones, a
deadline, and progress (PRD §21).

**Milestone** — a named checkpoint inside a goal. Worth XP when reached
(PRD §11's `goal_milestone`).

**Achievement** — a **permanent** milestone (PRD §28). `rarity` is presentational
only and drives the badge's visual weight; it must never feed a reward multiplier,
which would be a character-style stat effect in all but name.

**Focus session** — a timed work block with `duration`, optional task/project,
`started_at`/`ended_at`. Worth XP (PRD §27).

**Journal entry** — `date`, `mood`, `content`, `tags`. `mood` is for personal
reflection and must not be positioned as a mental-health diagnosis (PRD §26).
Journal content is sensitive: admin has no direct access to it (PRD §44).

**`system_config`** — one flat typed key/value table (ADR 0004). XP amounts live at
`xp.award.<source_type>`. It exists because four separate PRD requirements needed
server-side config and the forty-table schema in PRD §38 had nowhere to put it.

## Infrastructure

Terms specific to this stack's constraints. See
[ADR 0001](adr/0001-platform.md).

**Active CPU vs wall clock** — Workers Free caps *active CPU* at 10 ms per
invocation. Time spent awaiting the network does not count. So a Worker doing two
indexed queries is fine, and a Worker server-rendering a large page is not.

**CU-hour** — Neon's compute unit-hour allowance (100/month on Free). An always-on
0.25 CU database burns ~180 CU-hr/month, so scale-to-zero must stay enabled.

**`neon-http` / `pg` / PGlite** — three database drivers, each confined to one job:
HTTP fetch inside the Worker, TCP for migrations and CLI only, and in-process real
Postgres for tests. Do not collapse them; each fails outright in the others' place.

**PGlite** — PostgreSQL compiled to WebAssembly, running in-process. Real engine,
real triggers and constraints, no container and no credentials. It is what makes
`pnpm test` runnable anywhere. Its one gap is that it is single-connection, so
tests prove *sequential* idempotency, not true simultaneity.