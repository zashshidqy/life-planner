import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users.ts";

/**
 * `analytics_events` — append-only product telemetry. Closes roadmap gap §0.2.4.
 *
 * ## The gap this closes
 *
 * PRD §49 names DAU, WAU, MAU, and D1/D7/D30 retention as the primary success
 * metrics. PRD §38's forty-table list had no analytics table. The success
 * criteria as specified were therefore unmeasurable: there was no record of
 * anyone doing anything, and no way to compute a single one of them.
 *
 * The same section adds a constraint that shapes the design:
 *
 *   > Measure whether gamification increases meaningful activity, not merely
 *   > app opens.
 *
 * A bare "app opened" counter satisfies DAU while telling you nothing about
 * whether the product works. So the event vocabulary is defined around *things
 * that happened* — `task_completed`, `level_up`, `achievement_unlocked` — and
 * `app_open` exists as a denominator, not as the measurement. §49's product
 * metrics and the primary metrics come from the same rows.
 *
 * ## No event taxonomy table
 *
 * A `analytics_event_names` table would give the event name a foreign key and a
 * per-event property schema. Rejected for now: event names are emitted from a
 * union type in TypeScript, which already makes an unknown name a compile error,
 * and the metric queries that matter (§49) group by name across a handful of
 * values. If per-event schemas are ever needed, the union is where they get
 * added — one file, not a migration.
 *
 * ## Retention is computable from these rows plus `users.created_at`
 *
 * The cohort is a user's first day; retention is "did this cohort come back on
 * day N". `users.created_at` supplies the cohort and `occurred_at` supplies the
 * activity, so no separate retention table is needed. The query is written out
 * in docs/adr/0005-analytics-events.md so it is reviewable before anyone depends
 * on it.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    /**
     * Null before the user has signed in. The first authenticated event backfills
     * this from `anonymousId`, which is what makes the pre-signup install
     * count toward their own D1 rather than vanishing.
     */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),

    /**
     * Random per-install identifier, generated client-side on first launch and
     * rotated on sign-out. Deliberately not a device fingerprint: no hardware
     * identifiers, no canvas or font probing, nothing that would make this table
     * a tracking profile (PRD §32, §41).
     */
    anonymousId: text("anonymous_id"),

    /**
     * Groups events into a visit. PRD §49 reports "average session", which needs
     * a session boundary to exist as a first-class thing rather than being
     * inferred from idle gaps after the fact.
     */
    sessionId: text("session_id").notNull(),

    /**
     * Event name. Emitted from a TypeScript union in
     * `src/server/services/analytics/event-names.ts`, created in Phase 2 when
     * something first emits one — the union, not this column, is the source of
     * truth for the vocabulary.
     */
    name: text("name").notNull(),

    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    /**
     * Event-specific attributes. Shape varies by `name` and is typed per event
     * in the emitting service. `jsonb` rather than a wide sparse column set
     * because the vocabulary is still moving.
     */
    properties: jsonb("properties").$type<Record<string, unknown>>().default({}),
  },
  (t) => [
    // Every event must be attributable to somebody, even pre-auth. A row with
    // neither identifier is unqueryable and would quietly corrupt every count.
    check(
      "analytics_events_has_actor",
      sql`num_nonnulls(${t.userId}, ${t.anonymousId}) > 0`,
    ),
    // Retention and DAU/WAU/MAU all filter on a time window. This is the index
    // that keeps those queries off a sequential scan of the whole table.
    index("analytics_events_occurred_at_idx").on(t.occurredAt),
    // "Tasks completed per day" (§49 product metrics) and the per-user funnel.
    index("analytics_events_name_occurred_at_idx").on(t.name, t.occurredAt),
    index("analytics_events_user_occurred_at_idx").on(t.userId, t.occurredAt),
    // Session reconstruction without touching `analytics_sessions`.
    index("analytics_events_session_id_idx").on(t.sessionId),
  ],
);

/**
 * `analytics_sessions` — one row per visit.
 *
 * Separate from `analytics_events` because a session has a start, an end, and a
 * duration: those are aggregates over many events, and storing them as their own
 * row means "average session" (§49) is an index scan and a `avg()` instead of a
 * self-join. A row is written on first event of a visit and updated as the visit
 * continues, so a session is visible before it ends — a crashed tab still leaves
 * a session with a start time and no `endedAt`, which is more truthful than
 * dropping it.
 */
export const analyticsSessions = pgTable(
  "analytics_sessions",
  {
    /** Client-generated visit id, shared with `analytics_events.session_id`. */
    id: text("id").primaryKey(),

    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    anonymousId: text("anonymous_id"),

    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    /** Last event seen in this visit; `= startedAt` until the second event. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    /** Null while the visit is still open. */
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),

    /**
     * Cached so "average session" is a plain `avg()`. Null until the visit ends
     * rather than zero, so an open session is excluded from the average instead
     * of dragging it toward nothing.
     */
    durationSeconds: integer("duration_seconds"),

    /**
     * Coarse form factor only (`mobile` | `tablet` | `desktop`). Not a
     * user-agent string: storing raw UA strings is personal data with no
     * analytical payoff and a real retention obligation (PRD §32).
     */
    deviceType: text("device_type", {
      enum: ["mobile", "tablet", "desktop"],
    }),
  },
  (t) => [
    check(
      "analytics_sessions_has_actor",
      sql`num_nonnulls(${t.userId}, ${t.anonymousId}) > 0`,
    ),
    // DAU by date, computed over sessions rather than events — one row per user
    // per day instead of one per action.
    index("analytics_sessions_started_at_idx").on(t.startedAt),
    index("analytics_sessions_user_started_at_idx").on(t.userId, t.startedAt),
    check(
      "analytics_sessions_duration_nonnegative",
      sql`${t.durationSeconds} is null or ${t.durationSeconds} >= 0`,
    ),
  ],
);

/*
 * Note on absent constraints: a unique constraint on
 * `(user_id, occurred_at)` would be wrong here — one user genuinely does many
 * things in the same millisecond. Telemetry deduplication is therefore a client
 * concern (a batched offline flush carries an idempotency key) handled by the
 * emitting service, not something the schema can enforce.
 */

export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
export type AnalyticsSessionRow = typeof analyticsSessions.$inferInsert;
