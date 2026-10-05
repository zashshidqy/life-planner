/**
 * Drizzle schema barrel.
 *
 * Scope note: this contains the **progression core only** — eight tables plus
 * the two analytics tables that close roadmap gaps §0.2.3 and §0.2.4. It is
 * deliberately not the forty tables of PRD §38.
 *
 * The reason is the free-tier envelope. Neon Free allows 0.5 GB, and the
 * progression core is the part that must be correct before anything else can be
 * built on top of it: the ledger, the level cache, the streak record, the
 * achievement catalogue, and the configuration everything else reads. Writing
 * thirty more speculative tables now would produce migrations that are rewritten
 * in the phase that actually needs them, and would put the one constraint that
 * must never be retrofitted — `xp_transactions_user_source_uidx` — in a file
 * full of churn.
 *
 * PRD §38 remains the target schema. The rest of it arrives table-by-table with
 * the feature that owns it, and auth tables arrive with the auth phase. See
 * docs/adr/0001-platform.md §Schema scope.
 */

// ── Enums ────────────────────────────────────────────────────────────────────
export {
  achievementRarities,
  achievementRarityEnum,
  locales,
  localeEnum,
  xpSourceTypeEnum,
  xpSourceTypes,
  type AchievementRarity,
  type Locale,
  type XpSourceType,
} from "./_enums.ts";

// ── Accounts ────────────────────────────────────────────────────────────────
export { users, type UserRow } from "./users.ts";

// ── Progression (PRD §10, §11, §13, §39) ────────────────────────────────────
export {
  userProgression,
  xpTransactions,
  type UserProgressionRow,
  type XpTransactionRow,
} from "./progression.ts";

// ── Streaks (PRD §16, §17, §18) ─────────────────────────────────────────────
export { streakEvents, streaks, type StreakEventRow, type StreakRow } from "./streaks.ts";

// ── Achievements (PRD §28) ──────────────────────────────────────────────────
export {
  achievements,
  userAchievements,
  type AchievementCondition,
  type LocalizedText,
  type UserAchievementRow,
} from "./achievements.ts";

// ── Configuration (PRD §11, §13, §44, §45 — closes gap §0.2.3) ─────────────
export {
  configNamespaces,
  systemConfig,
  xpAwardConfigKey,
  type SystemConfigRow,
  type SystemConfigValueType,
} from "./system-config.ts";

// ── Analytics (PRD §49 — closes gap §0.2.4) ────────────────────────────────
export {
  analyticsEvents,
  analyticsSessions,
  type AnalyticsEventRow,
  type AnalyticsSessionRow,
} from "./analytics.ts";
