import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { xpSourceTypeEnum } from "./_enums.ts";
import { users } from "./users.ts";

/**
 * `streaks` — current streak state, one row per user.
 *
 * PRD §16 is specific about what counts: the streak is driven by *meaningful
 * activity*, not by opening the app. A day is only recorded in `streak_events`
 * when an activity that earns XP actually completed. That single rule is what
 * stops the streak metric from degenerating into a daily-active-user counter,
 * which PRD §49 explicitly warns against ("not merely app opens").
 *
 * `streaks` is a cache in exactly the same sense as `user_progression`: the
 * per-day truth is `streak_events`, and this row is the fast read for the
 * dashboard. Phase 2 rebuilds it from those events.
 */
export const streaks = pgTable(
  "streaks",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),

    /**
     * Consecutive qualifying days ending at `lastActivityDate`, or 0 if the
     * chain is broken. PRD §16.
     */
    currentStreak: integer("current_streak").notNull().default(0),

    /** Personal best (PRD §29, Personal Records). Never decreases. */
    longestStreak: integer("longest_streak").notNull().default(0),

    /**
     * Last day the user performed a qualifying activity, as a calendar date in
     * the user's own timezone. A `date`, not a `timestamp`: "did I show up
     * today" is a local-calendar question, and storing an instant here is how
     * streaks silently break for anyone east or west of UTC.
     */
    lastActivityDate: date("last_activity_date", { mode: "string" }),

    /**
     * IANA timezone the streak calendar is evaluated in. Stored explicitly
     * because the answer changes when a user travels, and a server default of
     * UTC would quietly move their boundary.
     */
    timezone: text("timezone").notNull().default("UTC"),

    /**
     * PRD §18 streak recovery: "encourage returning, not punish absence."
     * These are the unspent grace days. The roadmap lists grace days as a
     * default rather than an opt-in, so this is the normal state of a streak
     * that is merely at risk — not an emergency mechanism.
     */
    graceDaysRemaining: integer("grace_days_remaining").notNull().default(0),

    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("streaks_current_nonnegative", sql`${t.currentStreak} >= 0`),
    // The best streak can never be worse than the current one. Enforced in the
    // database so a projection bug cannot lower a user's lifetime record.
    check("streaks_longest_gte_current", sql`${t.longestStreak} >= ${t.currentStreak}`),
    check("streaks_grace_nonnegative", sql`${t.graceDaysRemaining} >= 0`),
  ],
);

/**
 * `streak_events` — the per-day record of qualifying activity. One row per
 * user per day.
 *
 * This table, not `streaks`, is what a streak is actually made of. The
 * `(user_id, activity_date)` unique index does two jobs at once:
 *
 *   1. It makes streak advancement idempotent. Re-processing the same day's
 *      activity — a client retry, a replayed webhook, a backfill job — cannot
 *      double-count the day, exactly as the XP ledger cannot double-credit.
 *   2. It is the natural key for "has the user already qualified today", which
 *      is the only query the streak logic needs to answer on the hot path.
 *
 * The `(user_id, activity_date)` index is unique, so no extra index is created
 * for the existence check.
 *
 * `sourceType`/`sourceId` record *which* activity opened the day. A day with
 * three completed tasks still has one row: the streak counts days, not actions.
 */
export const streakEvents = pgTable(
  "streak_events",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Local calendar date, matching the timezone recorded in `streaks`. */
    activityDate: date("activity_date", { mode: "string" }).notNull(),

    /** The first qualifying activity of that day. Denormalised for audit. */
    sourceType: xpSourceTypeEnum("source_type").notNull(),
    sourceId: text("source_id").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("streak_events_user_date_uidx").on(t.userId, t.activityDate),
    // Supports "who is on a streak that started on date X", which is how a
    // milestone achievement (§17) finds its candidates without scanning.
    index("streak_events_activity_date_idx").on(t.activityDate),
  ],
);

export type StreakRow = typeof streaks.$inferSelect;
export type StreakEventRow = typeof streakEvents.$inferSelect;
