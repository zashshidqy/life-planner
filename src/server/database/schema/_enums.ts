import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Shared enums.
 *
 * These are Postgres ENUM types rather than free text. The reason is not
 * stylistic: `xp_transactions.source_type` participates in the unique constraint
 * that makes XP idempotent, and a typo in a free-text column would silently
 * create a *second* idempotency bucket for what the caller believes is one
 * activity type. The database should refuse the typo.
 *
 * Adding a value to an enum is cheap (`ALTER TYPE ... ADD VALUE`, non-blocking
 * from PG 12). Renaming or removing one is not, which is why these are named for
 * concepts and not for specific sources.
 */

/**
 * An activity that can produce XP. Mirrors PRD §11/§14 and is the `source_type`
 * half of the `(user_id, source_type, source_id)` idempotency key.
 *
 * Every member must have a matching `system_config` row at `xp.award.<value>`
 * or `awardXp()` refuses to award anything. See docs/adr/0004-system-config.md.
 *
 * Deliberately absent: `admin_adjustment`. `awardXp()` takes no `amount`
 * parameter — that is what makes it impossible for a caller to nominate its own
 * payout — so an arbitrary operator-chosen amount cannot be expressed through
 * it. Corrections to the ledger (§39) are a separate path with an explicit
 * reason, written in the phase that builds the admin surface. Adding a member
 * here for a function that cannot serve it would be a lie in the enum.
 */
export const xpSourceTypes = [
  "task_completed", // PRD §11  "Task completed"
  "task_completed_important", // PRD §11  "Important task"
  "habit_completed", // PRD §11  "Habit completed"
  "routine_completed", // PRD §11  "Routine completed"
  "focus_session", // PRD §11  "Focus session"
  "journal_entry", // PRD §11  "Journal entry"
  "goal_milestone", // PRD §11  "Goal milestone"
  "weekly_review", // PRD §11  "Weekly review"
  "quest_completed", // PRD §14  Daily quests
  "achievement_unlocked", // PRD §28  Achievement reward
  "streak_milestone", // PRD §17  Streak milestone
] as const;

export type XpSourceType = (typeof xpSourceTypes)[number];

export const xpSourceTypeEnum = pgEnum("xp_source_type", xpSourceTypes);

/**
 * UI languages. Locked decision: bilingual, user-selectable (roadmap §1).
 * Stored per user, not per session, so a user's device language can differ from
 * their chosen language.
 */
export const locales = ["en", "id"] as const;
export type Locale = (typeof locales)[number];
export const localeEnum = pgEnum("locale", locales);

/**
 * Achievement rarity. Purely presentational (PRD §28, DESIGN §21) — it drives
 * the visual weight of the badge and nothing else. It must never feed into a
 * reward multiplier; that would be a character-style stat effect in all but name.
 */
export const achievementRarities = ["common", "rare", "epic", "legendary"] as const;
export type AchievementRarity = (typeof achievementRarities)[number];
export const achievementRarityEnum = pgEnum("achievement_rarity", achievementRarities);
