# ADR 0004 — `system_config`

**Status:** Accepted
**Date:** 2026-10-05
**Closes:** Roadmap §0.2.3

---

## Context

Four separate PRD sections require server-side configuration, and none of them
agree on where it lives.

| Section | Requires |
|---|---|
| §11 XP System | XP award amounts per activity type, configurable |
| §13 Level Curve | The curve itself, explicitly **not** hardcoded |
| §45 Monetization | FREE/PRO limits and plan entitlements |
| §44 Admin System | "System configuration" and "Feature flags" as admin screens |

PRD §38 lists forty tables. **None of them is a configuration table.** That is
the gap: the spec demands configurable configuration four times and provides no
place to put it.

The consequence of leaving this unresolved is not "we will add it later." It is
that the values get hardcoded — in TypeScript constants, in a client bundle, or in
a `switch` in the level calculation — and every one of those four sections becomes
a lie. §13's "never hardcoded" is the sharpest, because a hardcoded curve is the
thing that is most painful to change once users have progressed against it.

There is a second, subtler reason this matters **now** rather than later. §44
makes config an *admin-editable* surface, and roadmap risk #8 records that admin
access to sensitive data is a legal question. Config needs an audit trail
(§41) and an actor. Building config as a bare key/value map with no `updated_by`
means retrofitting accountability onto a table that is, by definition, the one
table someone will want to change quietly.

## Decision

**One flat typed key/value table. Namespace by dotted key convention. Type
enforced by a database CHECK constraint.**

```text
system_config
  key          text primary key   — dotted, lowercase: "xp.award.task_completed"
  value        jsonb not null     — the value, any JSON type
  value_type   text not null      — "number" | "boolean" | "string" | "json"
  description  text not null      — shown in the admin config screen (§44)
  updated_at   timestamptz        — default now()
  updated_by   text null          — admin who last changed it (§41 audit)
```

Seeded keys as of Phase 0 (`scripts/seed.ts`):

```text
xp.award.<source_type>      per activity type, from XP_AWARDS  (§11)
level.curve                 { coefficients }  json             (§13)
level.max                   scalar, duplicated so a read need not parse the curve
streak.milestone_days       [ … ]         json               (§17)
streak.grace_days_max       2                                (§18)
limits.free                 { … }         json               (§45)
limits.pro                  { … }         json               (§45)
feature.<flag>              boolean, five flags              (§44)
```

The two offline flags (`feature.offline_reads`, `feature.offline_writes`) ship
**off**. That is deliberate: ADR 0003's sequencing decision is enforced by config
rather than only by a document, so enabling offline writes becomes a config change
after the conflict design lands — not a code change under time pressure.

### Why one table and not one table per concern

The obvious design is a `feature_flags` table, a `plan_limits` table, and a
`level_curve` table. Rejected. Four schemas, four migrations, four read paths, and
four cache-invalidation stories — for what is fundamentally a small set of
tunables that all have the same shape (key, value, who changed it, when).

The counter-argument is worth taking seriously: a feature flag *is* conceptually
different from an XP payout. It has enablement, rollout percentage, targeting, and
an expiry.

The answer is that **a feature flag is configuration.** It goes in the same table
under `feature.*`. The concrete cost is that percentage rollout is not a
first-class column: if it is ever needed it is a `json` value at
`feature.rollout.<name>` and the flag body stays a boolean. That is an acceptable
trade for phase one, and reversing it later means *adding* a column, not
migrating data.

### `value_type` and the CHECK constraint — the load-bearing part

`jsonb` is the right column because one column then holds numbers, booleans,
strings, and structured objects like `limits.free`. It is also a hazard:

```text
key = "level.curve.base",  value_type = "number",  value = "100"   ← string!
```

`jsonb` accepts that. The caller reads `config.value` and gets a string where it
expects a number, and the failure surfaces as `NaN` deep inside a level
calculation — far from the row that caused it.

So the declared type is stored next to the value and a CHECK constraint
(`system_config_value_type_matches_jsonb`) enforces that they agree using
`jsonb_typeof()`:

```sql
check (system_config_value_type_matches_jsonb, (
    (value_type = 'number'  and jsonb_typeof(value) = 'number') or
    (value_type = 'boolean' and jsonb_typeof(value) = 'boolean') or
    (value_type = 'string'  and jsonb_typeof(value) = 'string') or
    (value_type = 'json'    and jsonb_typeof(value) in ('object','array'))
))
```

**The type system stops being a comment and becomes something the database
upholds.** A row claiming `number` while holding a JSON string cannot be
inserted, by `psql`, by drizzle-kit, by a migration, by anything.

Two more constraints, both cheap and both catching real mistakes:

- `system_config_key_lowercase` — `key = lower(key)`. Catches
  `XpAwardTaskCompleted` at insert time instead of at read time, when the
  function building the key spells it differently and silently awards nothing.
- Index on `split_part(key, '.', 1)` — admins list keys by namespace to render
  the §44 config screen.

`level.max` is worth calling out. The curve is stored as a `json` object of
coefficients, which is the honest representation of a formula — but parsing a JSON
object on every level check is work the read does not need to do, because
`max_level` is a constant, not a derived value. So it is **also** stored as a
scalar. That is deliberate duplication: the two can drift, and a test asserting
`level.max === level.curve.maxLevel` is what keeps them honest. Recorded here so
the duplication reads as a decision rather than as an oversight.

### The key naming convention is enforced by a constant, not a string

`xpAwardConfigKey(sourceType)` builds `"xp.award." + sourceType`, and
`configNamespaces` is a frozen object. A typo in a namespace is a compile error
rather than a config key that never matches a row.

This matters because **`awardXp()` has no `amount` parameter** (see ADR 0001 and
`award-xp.ts`): the payout is a pure function of `sourceType`, so a missing or
mistyped key produces a thrown `UnknownXpSourceError` — loud, at the exact call
site — instead of a zero award that looks identical in the product to a broken
feature.

### Reads fail loud, never default

`resolveXpAmount()` throws on a missing row, on a type mismatch, on a non-integer,
and on a value ≤ 0. There is no fallback.

The reasoning is product-level, not stylistic. A silently-defaulted XP award of 0
or a hardcoded 25 produces a user who completes tasks and sees nothing happen.
That is indistinguishable from a bug, is found in a support ticket, and — for an
app whose entire premise is motivational feedback (DESIGN §48) — is the worst
possible failure. A thrown error is found in development on the first click.

### `updated_by` deliberately does not reference `users`

It is a nullable `text` with no foreign key.

The reason is that config must be editable **before any user account exists** —
migrations and seeds write rows with no actor — and because an operator account
is not a product user. A FK to `users` would force admin actors into the same
table as end users, which conflates two different populations and means the
config screen depends on the auth system being fully wired.

`updated_by` also stays nullable for the seed path: Phase 0's seed writes config
rows with no actor, and pretending otherwise would mean fabricating a user.

## Consequences

**Accepted:**

- Config is not cached. Every `awardXp()` does one extra primary-key read. That
  read is network I/O, not CPU time, so it does not consume the Workers 10 ms
  budget (ADR 0001) — it costs latency, not the binding constraint. If config
  reads ever show up in latency, the fix is a per-isolate cache with a short TTL,
  and the invalidation story is trivial because writes are rare and admin-only.
- A `text` primary key is not free. Long keys are repeated in `description`-adjacent
  UI and in every index entry. At phase-one cardinality (tens of rows) this is
  irrelevant; at 10,000 flags it would want a surrogate key.
- Dotted keys are a **convention, not an enforced hierarchy**. Nothing prevents
  `xp.award.task` and `xp.award_task` coexisting. The lowercase CHECK and the
  constant namespace object reduce the risk; they do not eliminate it.

**Accepted as the right trade:**

- No `version` or `rollback` column. Audit lives in a future admin audit log
  (§41), not in the config table. Retrofitting a version history onto a config
  table that an admin edits is a small migration and Phase 4 can absorb it.
- No per-plan flag storage beyond a `limits.pro` JSON value. §45's entitlements
  will eventually want a `plans` table with subscriptions; that is Phase 4/5
  monetisation work, not configuration.

**Revisit trigger:**

The moment a second non-admin process needs to write config — a cron job, an
abuse-reaper, a backfill — `updated_by` as free text becomes an attribution
problem. The fix is a `principals` table, not a FK to `users`, and it arrives with
whatever feature needs it.