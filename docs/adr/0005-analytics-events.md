# ADR 0005 — `analytics_events` and `analytics_sessions`

**Status:** Accepted
**Date:** 2026-10-05
**Closes:** Roadmap §0.2.4

---

## Context

PRD §49 names the success metrics:

```text
DAU · WAU · MAU · D1 retention · D7 retention · D30 retention
```

and adds nine product metrics: tasks completed, habits completed, daily active
streak, average session, XP earned, level progression, achievement unlock rate,
share rate.

PRD §38's forty-table list contains **no analytics table**. There is no event log,
no session table, no funnel record. Every one of those metrics is currently
**uncomputable** — not "hard to compute," but impossible, because nothing records
that a user did anything at all.

Then §49 closes with a constraint that makes the naive fix wrong:

> Measure whether gamification increases meaningful activity, not merely app
> opens.

So the requirement is not "count opens." Counting opens satisfies DAU perfectly
while telling you nothing about whether the product works — and a design that
rewards app-opens is a design that produces anxious, obligation-feeling users,
which DESIGN §48 explicitly prohibits.

This is the gap with the longest fuse. It is invisible in Phase 0, invisible in
Phase 1, and by Phase 4 the question "is retention good?" cannot be answered
retroactively because the data was never collected. **Retention is not
reconstructable after the fact** — if you did not record that a user came back on
day 7, no later query can recover it.

### Why it is being built in Phase 0 when the roadmap scheduled it for Phase 4

The roadmap placed the analytics table in Phase 4. This ADR moves the **schema**
forward to Phase 0 while leaving the **emission** in Phase 4.

The reasoning is asymmetry of cost. A table that exists and is unused costs
nothing: no rows, no queries, no CPU, no storage. A table that is needed in
Phase 4 and does not exist costs a migration then, plus — critically — it
tempts the implementer to start emitting events without a settled vocabulary, and
the vocabulary is the whole design. Writing the schema now, with the vocabulary
deliberately deferred, means Phase 4 adds inserts to a table that already has the
right constraints and indexes, rather than designing both at once.

What this ADR does **not** do is emit events. `src/server/services/analytics/`
does not exist yet. Phase 0 ships the destination, not the traffic.

## Decision

**Two tables: an append-only event log and a session table. Retention is
computed from events plus `users.created_at` — no separate retention table.**

```text
analytics_events
  id             uuid primary key default gen_random_uuid()
  user_id        text null references users(id) on delete set null
  anonymous_id   text null        -- pre-auth actor
  session_id     text not null
  name           text not null
  occurred_at    timestamptz not null default now()
  properties     jsonb not null default '{}'

analytics_sessions
  id               text primary key       -- client-generated visit id
  user_id          text null references users(id) on delete set null
  anonymous_id     text null
  started_at       timestamptz not null default now()
  last_seen_at     timestamptz not null default now()
  ended_at         timestamptz null
  duration_seconds integer null
  device_type      text null   -- 'mobile' | 'tablet' | 'desktop'  (COARSE ONLY)
```

### The vocabulary is typed in TypeScript, not constrained in SQL

`name` is a plain `text` column. There is no `analytics_event_names` table and no
foreign key on `name`.

Rejected alternative: a taxonomy table giving each event name a row and a
per-event property schema. It would be more rigorous, and it is wrong for phase
one — because event names are emitted from a **TypeScript union**, which already
makes an unknown name a compile error. A FK would duplicate a guarantee the type
system gives for free while adding a table, a migration, a seed, and an insert on
every event emission.

The union (`AnalyticsEventName`, in `src/server/services/analytics/`, created in
Phase 2 when something first emits an event) is the source of truth for the
vocabulary. If per-event property schemas are ever needed, the union is where
they get added — one file, not a migration.

### The event vocabulary is built around `things that happened`

Per §49's warning, the design distinguishes **outcome events** from **denominator
events**:

```text
OUTCOME (what §49 actually wants to measure)
  task_completed · habit_completed · goal_completed · journal_created
  level_up · achievement_unlocked · streak_milestone_reached
  xp_awarded · session_shared

DENOMINATOR (exists so outcomes can be normalised, not to measure engagement)
  app_open · app_background · app_closed
```

`app_open` exists **because** DAU needs a definition, not because opens are a
product success. Achievement unlock rate is `achievement_unlocked / users who
reached the qualifying level` — not `achievement_unlocked / app_open`, which a
notification-badge-on-every-launch design could inflate without limit.

This distinction is the difference between measuring the loop (PRD §51) and
measuring anxiety (DESIGN §48).

### Pre-signup events are the reason for `anonymous_id`, and they are load-bearing

`user_id` is nullable, and `anonymous_id` is not a foreign key to anything — it is
a random per-install id generated client-side on first launch and rotated on
sign-out.

The reason is D1 retention. A user's first session happens **before** they have an
account. If only authenticated events were recorded, a cohort's day-0 activity
would be missing, and D1 would be computed against a denominator that excludes the
very first session — systematically understating retention for exactly the users
who churned at signup.

So the first authenticated event backfills `user_id` onto the anonymous rows for
that install. A pre-signup install then counts toward its own owner's D1 instead
of vanishing.

**`anonymous_id` is deliberately not a fingerprint.** No hardware identifiers, no
canvas probing, no font enumeration, no IP-derived pseudonym. PRD §32 (privacy)
and §41 (security) both apply, and a table that becomes a tracking profile is
hard to unpick later — you cannot retroactively un-collect it. A random id
rotated on sign-out gives install-level continuity and nothing more.

### `analytics_sessions` is separate because a session has a shape

A session has a start, an end, and a duration — those are **aggregates over many
events**. Storing them as their own row makes "average session" (§49) an index
scan plus `avg()` instead of a self-join with window functions over the event log.

The row is written on the first event of a visit and updated as the visit
continues, so a session is visible **before it ends**. A crashed tab or a closed
laptop leaves a session with `started_at` and a null `ended_at`, which is
truthful — it records that a visit started and never confirmed an end. Dropping
it would undercount; closing it at write time would invent an end.

`duration_seconds` stays null until the session ends rather than defaulting to 0.
An open session is therefore **excluded** from `avg(duration_seconds)` rather than
dragging the average toward zero. This is the same reasoning as
`xp_transactions.amount` being non-zero rather than defaulting: a placeholder zero
is a lie that propagates into every aggregate.

`device_type` is a **three-value enum of coarse form factor, not a user-agent
string.** Raw UA strings are personal data with no analytical payoff and a real
retention obligation. The PRD needs "is this user on mobile" (§4 is a mobile-first
target user), and that is answerable with three values.

### Retention is computable now, and the query is written down

Cohort = first day. Retention = did that cohort return on day N.

`users.created_at` supplies the cohort; `analytics_events.occurred_at` supplies
the activity. No third table is needed — which is fortunate, because a dedicated
retention table would need to be recomputed on every schedule and would be stale
by definition.

The D7 query, written out so it can be reviewed before anyone depends on it:

```sql
WITH cohort AS (
  SELECT id, date_trunc('day', created_at) AS cohort_day
  FROM   users
  WHERE  created_at >= now() - interval '90 days'
)
SELECT c.cohort_day,
       count(*)                                        AS cohort_size,
       count(*) FILTER (
         WHERE date_trunc('day', e.occurred_at) = c.cohort_day + interval '7 days'
       ) / nullif(count(*), 0)::float                   AS d7
FROM   cohort c
LEFT JOIN analytics_events e
       ON  e.user_id = c.id
GROUP BY c.cohort_day
ORDER BY c.cohort_day;
```

Written here, before Phase 4, so that a schema question discovered during
implementation (do we need a `first_seen_at`?) gets answered while changing the
schema is cheap. That is the entire reason this ADR exists in Phase 0.

### Constraints, and the one that is deliberately absent

Two CHECK constraints require every row to have **some** actor:

```sql
check (analytics_events_has_actor, num_nonnulls(user_id, anonymous_id) > 0)
```

A row with neither identifier is unqueryable and would silently corrupt every
count it participates in — it looks like a valid event with an unjoinable actor.
Better to reject it at insert.

Indexes are chosen by the queries §49 implies:

| Index | Serves |
|---|---|
| `(occurred_at)` | every DAU/WAU/MAU and retention time-window query |
| `(name, occurred_at)` | "tasks completed per day", per-event funnels |
| `(user_id, occurred_at)` | per-user timeline, funnel by user |
| `(session_id)` on events | session reconstruction |
| `(started_at)`, `(user_id, started_at)` on sessions | DAU by session; per-user sessions |

**No unique constraint on `(user_id, occurred_at)`** — and this one is worth
stating because it looks like an omission. One user genuinely does many things in
the same millisecond; a double-tap on "complete" and a level-up from it land
together. Enforcing uniqueness there would either reject real events or require a
synthetic `occurred_at` with millisecond jitter.

Telemetry deduplication is therefore a **client** concern: a batched offline flush
carries an idempotency key, and the emitting service (Phase 4) is responsible for
it. It is not something this schema can enforce.

## Consequences

**Accepted:**

- `analytics_events` will grow faster than any other table. It is append-only and
  never queried by primary key in aggregate. At year-1 volumes this is negligible
  against Neon's 0.5 GB, but unlike `xp_transactions` (§2.3 of the roadmap) there
  is **no retention policy for it** — unlike the XP ledger, events have no
  long-term analytical value once a cohort window has passed. Phase 4 must decide
  a deletion policy. This is recorded as a known gap, not an oversight.
- Retention is computed on the fly, so a 90-day cohort query is not free. Fine at
  this scale; if it becomes a problem the fix is a materialized rollup, not a
  different event model.
- The `name → properties` relationship is only as strict as the TypeScript union.
  A hand-written `psql` insert can put arbitrary JSON in `properties`.

**Accepted as the right trade:**

- Pre-signup tracking exists at all. It is limited to a random install id with no
  device characteristics, and it is what makes D1 honest. The alternative —
  authenticated-only — means measuring retention from the second session onward,
  which is not retention.
- `analytics_sessions` is denormalised aggregate data. `duration_seconds` could be
  recomputed from events. It is stored because "average session" is a §49 primary
  metric and a denormalised `avg()` is the cheapest possible answer.

**Revisit trigger:**

If Phase 4 finds that session boundaries inferred client-side are unreliable —
app killed without a close event, so sessions run long — the fix is a server-side
session timeout heuristic, not a schema change. `last_seen_at` already supports
it.