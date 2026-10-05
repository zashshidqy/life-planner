import "server-only";

import { eq } from "drizzle-orm";

import type { Database } from "@/server/database/client";
import { systemConfig, xpTransactions, type XpSourceType } from "@/server/database/schema";
import { xpAwardConfigKey } from "@/server/database/schema/system-config";

/**
 * `awardXp()` — the only sanctioned way to grant XP.
 *
 * This is the whole of the Phase 0 progression surface, and it exists to make one
 * guarantee testable before a single feature is built on top of it: **the same
 * real-world event can never be credited twice.**
 *
 * Four properties, each traceable to the PRD:
 *
 * 1. **Idempotent.** PRD §12 requires server-side duplicate detection. Retries,
 *    double-taps, and concurrent requests are ordinary, not exceptional. The
 *    guarantee is a unique index
 *    (`xp_transactions_user_source_uidx`), not a read-then-write check, because
 *    only a database constraint survives two requests arriving at once.
 *
 * 2. **Amount resolved from config, never from the caller.** PRD §11 and §13
 *    forbid hardcoding XP. The signature has no `amount` parameter — there is
 *    no code path by which a client, or any other service, can nominate its own
 *    payout. The amount is looked up from `system_config` at
 *    `xp.award.<source_type>`.
 *
 * 3. **Fails loud when unconfigured.** A missing config row throws. It does not
 *    award zero and it does not award a default. A silently-zero award looks
 *    identical, in the product, to the feature being broken — but it hides the
 *    cause, and a hard failure is found in development instead of in a support
 *    ticket.
 *
 * 4. **Append-only.** No update, no delete, no compensating write. A correction
 *    is a new negative `amount` through this same function, which keeps the sum
 *    of the ledger equal to the truth (PRD §39).
 *
 * ## Not in Phase 0, deliberately
 *
 * `awardXp` writes the ledger and nothing else. It does not touch
 * `user_progression`, does not check for a level-up, and does not evaluate
 * achievements. Those belong to `projectProgression()` in Phase 2, and
 * implementing them here would put cache logic on the same code path as the
 * ledger write — which is exactly the coupling PRD §39 exists to prevent. The
 * cache is rebuilt from the ledger; it is never the thing that decides.
 */

export class UnknownXpSourceError extends Error {
  readonly sourceType: string;

  constructor(sourceType: string) {
    super(
      `No system_config row at "${xpAwardConfigKey(sourceType)}". ` +
        `XP values are configuration (PRD §11) — add the row before awarding.`,
    );
    this.name = "UnknownXpSourceError";
    this.sourceType = sourceType;
  }
}

export class InvalidXpConfigError extends Error {
  readonly configKey: string;

  constructor(configKey: string, detail: string) {
    super(`system_config["${configKey}"] is not a usable XP amount: ${detail}`);
    this.name = "InvalidXpConfigError";
    this.configKey = configKey;
  }
}

export type AwardXpInput = {
  /** Always from the authenticated session — never from request data (PRD §40). */
  userId: string;
  /** Which kind of activity. Determines the payout via config. */
  sourceType: XpSourceType;
  /**
   * Id of the specific activity, e.g. the task row id. The idempotency key.
   * Must be stable: if the same event is retried, it must supply the same
   * `sourceId`, or the retry will be credited as a new event.
   */
  sourceId: string;
};

/**
 * Outcome of one `awardXp()` call.
 *
 * A single object rather than a discriminated union. The earlier union shaped it
 * as `{credited: true, …} | {duplicate: true, …}`, which meant `credited` was
 * simply absent on the duplicate path — and `if (result.credited)` was the natural
 * thing for a caller to write, which then read `undefined` on the case that
 * matters most. A boolean that is always present cannot be read the wrong way.
 *
 * Invariant: `credited === (transactionId !== null)`. There is no state in which
 * a row was created but not reported, or reported without being created.
 */
export type AwardXpResult = {
  /**
   * True when this call created the ledger row. False when an identical
   * `(userId, sourceType, sourceId)` already existed — a retry, a double-tap, or
   * a concurrent duplicate.
   */
  readonly credited: boolean;

  /** Id of the ledger row, or null when this call was a duplicate. */
  readonly transactionId: string | null;

  /**
   * The resolved payout. Present on both paths so a caller can log "already had
   * this" without a second query, and so a test can assert that a retry resolved
   * the same value from the same config.
   */
  readonly amount: number;
};

/**
 * Credits XP for one activity, at most once ever.
 *
 * Costs two indexed single-row lookups: one primary-key read on `system_config`,
 * one insert against a unique index. That is comfortably inside the Workers Free
 * 10 ms CPU budget, and the wait on Neon is network I/O rather than CPU time
 * (docs/adr/0001-platform.md §The 10 ms CPU limit).
 */
export async function awardXp(db: Database, input: AwardXpInput): Promise<AwardXpResult> {
  const { userId, sourceType, sourceId } = input;
  const configKey = xpAwardConfigKey(sourceType);

  // 1. Resolve the payout from configuration. Server-side by construction: the
  //    amount is a function of `sourceType`, which is an enum, so a client
  //    cannot express an arbitrary payout even if it tampers with the request.
  const amount = await resolveXpAmount(db, configKey, sourceType);

  // 2. Insert, colliding deliberately with the unique index. `onConflictDoNothing`
  //    is what turns a database constraint into a value: it is the only thing
  //    here that makes the second call a no-op rather than an error, and the
  //    only thing that makes the second call a no-op *concurrently*.
  const inserted = await db
    .insert(xpTransactions)
    .values({
      userId,
      sourceType,
      sourceId,
      amount,
      // Denormalised provenance so an auditor reading only the ledger does not
      // have to join to config that may since have been edited.
      reason: configKey,
    })
    .onConflictDoNothing({
      target: [xpTransactions.userId, xpTransactions.sourceType, xpTransactions.sourceId],
    })
    .returning({ id: xpTransactions.id });

  const row = inserted[0];
  if (row === undefined) {
    return { credited: false, transactionId: null, amount };
  }
  return { credited: true, transactionId: row.id, amount };
}

/**
 * Reads and validates `xp.award.<source_type>`.
 *
 * Every rejection path throws. There is no fallback value, on purpose: see
 * property 3 in the `awardXp` doc comment.
 */
async function resolveXpAmount(
  db: Database,
  configKey: string,
  sourceType: string,
): Promise<number> {
  const [config] = await db
    .select({ value: systemConfig.value, valueType: systemConfig.valueType })
    .from(systemConfig)
    .where(eq(systemConfig.key, configKey))
    .limit(1);

  if (config === undefined) {
    throw new UnknownXpSourceError(sourceType);
  }
  if (config.valueType !== "number" || typeof config.value !== "number") {
    throw new InvalidXpConfigError(
      configKey,
      `expected value_type "number" with a JSON number, found value_type "${config.valueType}".`,
    );
  }
  if (!Number.isInteger(config.value)) {
    throw new InvalidXpConfigError(configKey, `${config.value} is not an integer.`);
  }
  if (config.value <= 0) {
    // Zero and negative are both rejected: `xp_transactions_amount_nonzero` would
    // reject a zero insert at the database anyway, and a negative *award* would
    // be a correction, which is a different call with an explicit reason.
    throw new InvalidXpConfigError(configKey, `${config.value} must be greater than 0.`);
  }
  return config.value;
}
