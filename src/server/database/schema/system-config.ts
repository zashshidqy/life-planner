import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * `system_config` — typed key/value store for everything the PRD requires to be
 * configurable. Closes roadmap gap §0.2.3.
 *
 * ## The gap this closes
 *
 * PRD §11 (XP values), §13 (level curve), §45 (pricing and plan limits), §44
 * (system configuration, feature flags) all say the same thing: these values
 * must be adjustable from the server and must not be hardcoded in the client.
 * PRD §38's forty-table list contained nothing to hold them. As written, the
 * spec demanded configurable configuration and provided no place to put it — so
 * the values would have been hardcoded anyway, which is the exact failure the
 * sections were written to prevent.
 *
 * ## Shape: one flat table, not a table per concern
 *
 * The alternative designs were a `feature_flags` table, a `plan_limits` table,
 * a `level_curve` table, and so on. Rejected: four schemas, four migrations, and
 * four read paths to keep consistent, for what is fundamentally a small set of
 * tunables. Instead, everything lives here under a namespaced `key`:
 *
 * ```text
 * xp.award.task_completed          = 10          number
 * level.curve.base                 = 100        number
 * level.curve.growth               = 1.35       number
 * limits.free                      = {…}        json
 * feature.offline_writes           = false      boolean
 * ```
 *
 * A feature flag *is* configuration. Making it a separate entity would create a
 * second thing to read, cache, and invalidate for no gain. The consequence is
 * that a flag cannot carry a rollout percentage as a first-class column; if
 * percentage rollout is ever needed it is a `json` value at `feature.rollout.<x>`
 * and the flag body stays a boolean. That is an acceptable trade for phase one.
 *
 * ## `value_type` and the CHECK constraint
 *
 * `value` is `jsonb` so one column holds numbers, booleans, strings, and
 * structured objects. That flexibility is also a hazard: `jsonb` accepts
 * `{"any": "thing"}` under a key that callers assume is a number, and the
 * failure surfaces as `NaN` deep inside a level calculation.
 *
 * So the declared type is stored alongside the value and a CHECK constraint
 * enforces that the two agree. A row claiming `value_type = 'number'` while
 * holding a JSON string cannot be inserted. The type system stops being a
 * comment and becomes a constraint the database upholds.
 *
 * Reads still validate in application code. `awardXp()` in
 * `src/server/services/progression/award-xp.ts` is the only reader in Phase 0,
 * and it throws rather than defaulting; the general `readConfig()` helper
 * arrives with `levelFor()` in Phase 2. The constraint guarantees the shape; the
 * reader guarantees the meaning.
 */
export const systemConfig = pgTable(
  "system_config",
  {
    /**
     * Dotted namespaced key, e.g. `xp.award.task_completed`. Dots are
     * conventional rather than enforced; there is no hierarchy to query.
     */
    key: text("key").primaryKey(),

    value: jsonb("value").notNull(),

    /**
     * Declared type of `value`. Enforced against `jsonb_typeof(value)` by the
     * CHECK constraint below. Adding a member here requires widening that
     * constraint in a migration — which is the point.
     */
    valueType: text("value_type", {
      enum: ["number", "boolean", "string", "json"],
    })
      .notNull()
      .default("json"),

    /** Why this key exists, shown in the admin config screen (PRD §44). */
    description: text("description").notNull().default(""),

    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),

    /**
     * Admin who last changed the row (PRD §44, §41 audit logging).
     * Nullable because migrations and seeds write rows without an actor.
     * Does not reference `users` on purpose: config must remain editable when
     * no user accounts exist, and an operator account is not a product user.
     */
    updatedBy: text("updated_by"),
  },
  (t) => [
    // The load-bearing constraint of this table. See the block comment above.
    check(
      "system_config_value_type_matches_jsonb",
      sql`(
        (${t.valueType} = 'number'  and jsonb_typeof(${t.value}) = 'number') or
        (${t.valueType} = 'boolean' and jsonb_typeof(${t.value}) = 'boolean') or
        (${t.valueType} = 'string'  and jsonb_typeof(${t.value}) = 'string') or
        (${t.valueType} = 'json'    and jsonb_typeof(${t.value}) in ('object', 'array'))
      )`,
    ),
    // A dot-namespaced flat key is the only shape the reader understands.
    // Catching `XpAwardTaskCompleted` at insert time beats catching it in prod.
    check("system_config_key_lowercase", sql`${t.key} = lower(${t.key})`),
    // Admins list keys by prefix to render the config screen.
    index("system_config_key_prefix_idx").on(sql`split_part(${t.key}, '.', 1)`),
  ],
);

export type SystemConfigRow = typeof systemConfig.$inferSelect;
export type SystemConfigValueType = SystemConfigRow["valueType"];

/** Well-known namespaces. Kept as constants so a typo is a compile error. */
export const configNamespaces = {
  xpAward: "xp.award",
  levelCurve: "level.curve",
  limits: "limits",
  feature: "feature",
  streak: "streak",
} as const;

/** Builds `xp.award.<sourceType>` — the key `awardXp()` reads. */
export function xpAwardConfigKey(sourceType: string): string {
  return `${configNamespaces.xpAward}.${sourceType}`;
}
