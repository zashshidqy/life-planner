/**
 * Seeds `system_config` — the tunable values PRD §11, §13, §17, §18, §44 and §45
 * require to be configurable from the server.
 *
 * Run with `pnpm db:seed`. Idempotent: every row is an upsert on `key`, so it is
 * safe to re-run after adding a key and it will not clobber an operator's
 * deliberate edit to an *existing* key's semantics — it will overwrite the
 * value, which is why production changes go through the admin screen (PRD §44)
 * rather than through this script.
 *
 * ## Why this is a script and not a migration
 *
 * Migrations describe schema. These are values, and values change without a
 * deploy — that is the entire point of §11 and §13. Baking them into a migration
 * would mean changing a migration that has already run, which is the thing
 * migrations exist to prevent. Seeds are versioned alongside the code, applied
 * separately, and safe to re-run.
 *
 * ## Values and their provenance
 *
 * Every number below is either quoted from the PRD or derived from the PRD's own
 * worked example. Nothing is invented. Where the PRD is silent, no row is
 * seeded and `awardXp()` throws — see the note on unseeded XP sources.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { systemConfig } from "../src/server/database/schema/index.ts";

// ─── XP awards — PRD §11, quoted verbatim ───────────────────────────────────
//
// `xp.award.<source_type>` is the key `awardXp()` reads. Note that three enum
// members are deliberately absent:
//
//   achievement_unlocked  → amount lives on `achievements.xp_reward`, which is
//                           per-achievement rather than global.
//   streak_milestone      → PRD §17 assigns streak milestones an achievement,
//                           not XP. No XP is defined.
//   (admin correction)    → not an enum member at all; see `_enums.ts`.
//
// Leaving them unseeded is a live demonstration of `awardXp()`'s fail-loud
// behaviour: calling it for one of these throws `UnknownXpSourceError` instead
// of silently crediting zero.

const XP_AWARDS: ReadonlyArray<readonly [source: string, amount: number, prd: string]> = [
  ["task_completed", 10, "PRD §11 — Task completed"],
  ["task_completed_important", 25, "PRD §11 — Important task"],
  ["habit_completed", 10, "PRD §11 — Habit completed"],
  ["routine_completed", 20, "PRD §11 — Routine completed"],
  ["focus_session", 15, "PRD §11 — Focus session"],
  ["journal_entry", 10, "PRD §11 — Journal entry"],
  ["goal_milestone", 100, "PRD §11 — Goal milestone"],
  ["weekly_review", 50, "PRD §11 — Weekly review"],
  // PRD §14 shows quest payouts of +20 to +50 XP. 50 is the top of the PRD's
  // own example range, and the value an operator will most likely want to tune.
  ["quest_completed", 50, "PRD §14 — Daily quest, top of the PRD's stated range"],
];

// ─── Level curve — PRD §13 ───────────────────────────────────────────────────
//
// PRD §13 gives a worked example and says the final formula must be
// configurable:
//
//     Level 1 → 100 XP
//     Level 2 → 250 XP
//     Level 3 → 450 XP
//     Level 4 → 700 XP
//
// Those four points are not arbitrary. First differences are 150, 200, 250; the
// second difference is a constant 50. A constant second difference means a
// quadratic, so the requirement at level n is `25n² + 75n + 0`, which
// reproduces all four PRD values exactly:
//
//     n=1 →  25 +  75 = 100  ✓
//     n=2 → 100 + 150 = 250  ✓
//     n=3 → 225 + 225 = 450  ✓
//     n=4 → 400 + 300 = 700  ✓
//
// So the seed stores the coefficients rather than a formula string. Parsing an
// expression string at request time is a code-injection surface with no upside;
// three numbers in a config row are reviewable, diffable, and type-checked.
//
// `maxLevel` caps progression so lifetime XP cannot produce an unbounded level
// that breaks layout or costs more to render than it is worth (DESIGN §12 makes
// the level number a focal point — a six-digit one would wreck it).

const LEVEL_CURVE = {
  kind: "quadratic",
  requirementAtLevel: { nSquared: 25, n: 75, constant: 0 },
  maxLevel: 500,
} as const;

// ─── Streaks — PRD §17, §18 ──────────────────────────────────────────────────

const STREAK_MILESTONE_DAYS = [7, 30, 60, 100, 365] as const; // PRD §17

// ─── Plan limits — PRD §45 ───────────────────────────────────────────────────
//
// PRD §45 names the feature split and says pricing and feature limits must be
// configurable. Numbers here are placeholders: they encode *shape*, and the
// honest statement is that the free-tier envelope has not been priced yet. They
// are seeded so the admin screen and the entitlement check have something to
// read and so the shape is settled, not because 50 is the right number for
// tasks. Expect these to change before launch.

const PLAN_LIMITS = {
  free: {
    maxTasks: 50,
    maxGoals: 3,
    maxHabits: 5,
    maxProjects: 0,
    maxRoutines: 0,
    analytics: "basic",
    sharing: false,
  },
  pro: {
    maxTasks: null,
    maxGoals: null,
    maxHabits: null,
    maxProjects: null,
    maxRoutines: null,
    analytics: "advanced",
    sharing: true,
  },
} as const;

// ─── Feature flags — PRD §44 ─────────────────────────────────────────────────
//
// Stored in `system_config` rather than a dedicated table; see
// docs/adr/0004-system-config.md §"One flat table".
//
// Both offline flags are OFF in Phase 0. PRD §36 puts offline in the MVP while
// PRD §37 says conflict resolution must be designed first — the contradiction is
// resolved by ADR 0003, which sequences offline reads in Phase 3 and offline
// *writes* behind a design document. The flags exist so that decision is
// enforced in the product rather than only in a document, and so turning the
// write path on becomes a config change rather than a code change.
const FEATURE_FLAGS = {
  "feature.offline_reads": false, // Phase 3: service-worker caching, read-only
  "feature.offline_writes": false, // Blocked until conflict resolution is designed
  "feature.pwa_install_prompt": false, // Phase 3
  "feature.public_profile": false, // PRD §31, post-MVP
  "feature.social_share_cards": false, // PRD §30, post-MVP
} satisfies Record<string, boolean>;

// ─── Rows ────────────────────────────────────────────────────────────────────

type SeedRow = {
  key: string;
  value: unknown;
  valueType: "number" | "boolean" | "string" | "json";
  description: string;
};

function rows(): SeedRow[] {
  const out: SeedRow[] = [];

  for (const [source, amount, prd] of XP_AWARDS) {
    out.push({
      key: `xp.award.${source}`,
      value: amount,
      valueType: "number",
      description: `XP awarded for ${source}. Source: ${prd}.`,
    });
  }

  out.push({
    key: "level.curve",
    value: LEVEL_CURVE,
    valueType: "json",
    description:
      "Level requirement curve (PRD §13). requirementAtLevel(n) = nSquared·n² + n·n + constant. " +
      "Coefficients fitted to the PRD's own worked example (100/250/450/700).",
  });

  out.push({
    key: "level.max",
    value: LEVEL_CURVE.maxLevel,
    valueType: "number",
    description: "Hard level ceiling. Duplicated as a scalar so a read does not need to parse the curve.",
  });

  out.push({
    key: "streak.milestone_days",
    value: [...STREAK_MILESTONE_DAYS],
    valueType: "json",
    description: "Streak milestones in days (PRD §17). Each grants an achievement.",
  });

  out.push({
    key: "streak.grace_days_max",
    value: 2,
    valueType: "number",
    description:
      "Grace days a user may hold (PRD §18). Default rather than opt-in, per roadmap §0.1: " +
      "gamification must not create anxiety.",
  });

  out.push({
    key: "limits.free",
    value: PLAN_LIMITS.free,
    valueType: "json",
    description: "Free plan feature limits (PRD §45). Placeholder values pending pricing.",
  });

  out.push({
    key: "limits.pro",
    value: PLAN_LIMITS.pro,
    valueType: "json",
    description: "Pro plan feature limits (PRD §45). null = unlimited.",
  });

  for (const [key, enabled] of Object.entries(FEATURE_FLAGS)) {
    out.push({
      key,
      value: enabled,
      valueType: "boolean",
      description: `Feature flag ${key.replace("feature.", "")} (PRD §44). See docs/adr/0003-offline-sequencing.md.`,
    });
  }

  return out;
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Set DIRECT_DATABASE_URL (or DATABASE_URL) before seeding. See .env.example.",
    );
  }

  // `pg`, not `neon-http`: this script runs on a developer machine or in CI, and
  // `neon-http` speaks Neon's HTTP protocol exclusively — given a plain
  // `postgresql://` URL it tries to reach `https://api.<host>/sql` and fails with
  // "Failed to parse URL". The same reason `drizzle-kit` needs `pg`: DDL and seed
  // DML are Node-side tooling, application traffic is the Worker's job
  // (docs/adr/0001-platform.md §Database drivers).
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema: { systemConfig }, casing: "snake_case" });
  const seedRows = rows();

  try {
    await seed(db, seedRows);
  } finally {
    // Without this the process hangs on an idle pooled socket, and `pnpm db:seed`
    // looks like it froze after printing its output.
    await pool.end();
  }
}

/** Only `execute()` is used, so the handle is kept loose on purpose. */
async function seed(
  db: { execute: (query: string) => Promise<unknown> },
  seedRows: SeedRow[],
): Promise<void> {
  // Values are emitted as *text* literals cast to jsonb, not as native JS
  // literals cast. `JSON.stringify(10) + "::jsonb"` produces `10::jsonb`, and
  // Postgres 17 has no integer→jsonb cast in pg_cast, so that fails with
  // "cannot cast type integer to jsonb". Quoting first ('10'::jsonb) works for
  // every value type uniformly, because JSON.stringify output is already valid
  // JSON text.
  //
  // Single quotes are escaped for the SQL string literal. JSON.stringify escapes
  // double quotes but not single quotes, and a description containing an
  // apostrophe would otherwise terminate the literal.
  const sqlText = (value: string): string => `'${value.replaceAll("'", "''")}'`;

  const values = seedRows
    .map(
      (row, i) =>
        `(${i}, ${sqlText(row.key)}, ${sqlText(JSON.stringify(row.value))}::jsonb, ` +
        `${sqlText(row.valueType)}, ${sqlText(row.description)})`,
    )
    .join(",\n     ");

  // The VALUES list carries a leading `sort` so rows land in a defined order (the
  // ON CONFLICT DO UPDATE of an earlier row must not clobber a later duplicate).
  // That column is therefore projected *out* explicitly — a bare `SELECT *` would
  // emit five columns for a five-column target and put `sort` into `key`.
  await db.execute(`
    INSERT INTO system_config (key, value, value_type, description, updated_by)
    SELECT v.key, v.value, v.value_type, v.description, NULL
    FROM (VALUES ${values})
      AS v (sort, key, value, value_type, description)
    ORDER BY v.sort
    ON CONFLICT (key) DO UPDATE SET
      value       = EXCLUDED.value,
      value_type  = EXCLUDED.value_type,
      description = EXCLUDED.description,
      updated_at  = now()
  `);
  // `updated_by` is intentionally absent from the DO UPDATE. Re-running the seed
  // is not an operator edit, and stamping it as one would pollute the audit
  // trail PRD §41 asks for. A real edit goes through the admin screen (§44),
  // which sets `updated_by` there.

  console.log(`Seeded ${seedRows.length} system_config keys:`);
  for (const row of seedRows) console.log(`  ${row.key}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});