CREATE TYPE "public"."achievement_rarity" AS ENUM('common', 'rare', 'epic', 'legendary');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en', 'id');--> statement-breakpoint
CREATE TYPE "public"."xp_source_type" AS ENUM('task_completed', 'task_completed_important', 'habit_completed', 'routine_completed', 'focus_session', 'journal_entry', 'goal_milestone', 'weekly_review', 'quest_completed', 'achievement_unlocked', 'streak_milestone');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"description" jsonb NOT NULL,
	"icon" text NOT NULL,
	"rarity" "achievement_rarity" DEFAULT 'common' NOT NULL,
	"condition" jsonb NOT NULL,
	"xp_reward" integer DEFAULT 0 NOT NULL,
	"is_secret" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_xp_reward_nonnegative" CHECK ("achievements"."xp_reward" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"progress_at_unlock" integer,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_achievements_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"anonymous_id" text,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	CONSTRAINT "analytics_events_has_actor" CHECK (num_nonnulls("analytics_events"."user_id", "analytics_events"."anonymous_id") > 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"anonymous_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"device_type" text,
	CONSTRAINT "analytics_sessions_has_actor" CHECK (num_nonnulls("analytics_sessions"."user_id", "analytics_sessions"."anonymous_id") > 0),
	CONSTRAINT "analytics_sessions_duration_nonnegative" CHECK ("analytics_sessions"."duration_seconds" is null or "analytics_sessions"."duration_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "streak_events" (
	"user_id" text NOT NULL,
	"activity_date" date NOT NULL,
	"source_type" "xp_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"last_activity_date" date,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"grace_days_remaining" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "streaks_current_nonnegative" CHECK ("streaks"."current_streak" >= 0),
	CONSTRAINT "streaks_longest_gte_current" CHECK ("streaks"."longest_streak" >= "streaks"."current_streak"),
	CONSTRAINT "streaks_grace_nonnegative" CHECK ("streaks"."grace_days_remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" text DEFAULT 'json' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	CONSTRAINT "system_config_value_type_matches_jsonb" CHECK ((
        ("system_config"."value_type" = 'number'  and jsonb_typeof("system_config"."value") = 'number') or
        ("system_config"."value_type" = 'boolean' and jsonb_typeof("system_config"."value") = 'boolean') or
        ("system_config"."value_type" = 'string'  and jsonb_typeof("system_config"."value") = 'string') or
        ("system_config"."value_type" = 'json'    and jsonb_typeof("system_config"."value") in ('object', 'array'))
      )),
	CONSTRAINT "system_config_key_lowercase" CHECK ("system_config"."key" = lower("system_config"."key"))
);
--> statement-breakpoint
CREATE TABLE "user_progression" (
	"user_id" text PRIMARY KEY NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp_into_level" integer DEFAULT 0 NOT NULL,
	"xp_for_next_level" integer NOT NULL,
	"lifetime_xp" bigint DEFAULT 0 NOT NULL,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_progression_level_positive" CHECK ("user_progression"."level" >= 1),
	CONSTRAINT "user_progression_xp_into_level_nonnegative" CHECK ("user_progression"."xp_into_level" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text,
	"locale" "locale" DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "xp_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_type" "xp_source_type" NOT NULL,
	"source_id" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "xp_transactions_amount_nonzero" CHECK ("xp_transactions"."amount" <> 0)
);
--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_sessions" ADD CONSTRAINT "analytics_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streak_events" ADD CONSTRAINT "streak_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_progression" ADD CONSTRAINT "user_progression_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_transactions" ADD CONSTRAINT "xp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievements_active_sort_idx" ON "achievements" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "user_achievements_user_unlocked_at_idx" ON "user_achievements" USING btree ("user_id","unlocked_at");--> statement-breakpoint
CREATE INDEX "analytics_events_occurred_at_idx" ON "analytics_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_name_occurred_at_idx" ON "analytics_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_user_occurred_at_idx" ON "analytics_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_session_id_idx" ON "analytics_events" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "analytics_sessions_started_at_idx" ON "analytics_sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "analytics_sessions_user_started_at_idx" ON "analytics_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "streak_events_user_date_uidx" ON "streak_events" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE INDEX "streak_events_activity_date_idx" ON "streak_events" USING btree ("activity_date");--> statement-breakpoint
CREATE INDEX "system_config_key_prefix_idx" ON "system_config" USING btree (split_part("key", '.', 1));--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_uidx" ON "users" USING btree ("username") WHERE "users"."username" is not null;--> statement-breakpoint
CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "xp_transactions_user_source_uidx" ON "xp_transactions" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "xp_transactions_created_at_idx" ON "xp_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "xp_transactions_user_created_at_idx" ON "xp_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
-- ---------------------------------------------------------------------------
-- Append-only enforcement on the XP ledger.
--
-- Hand-written, appended after drizzle-kit generated the DDL above. PRD §39 makes
-- `xp_transactions` the source of truth; a source of truth that can be edited in
-- place is not a source of truth, it is a cache with extra steps. The unique
-- index above already prevents double-crediting — this enforces the other half
-- of the same property: nothing may ever be rewritten or removed.
--
-- Why a trigger rather than convention: an UPDATE that silently rewrites history
-- is invisible. No diff to review, no test to fail, no way to recover the
-- original value. A trigger turns it into an immediate, loud failure at the point
-- of the mistake. The stronger alternative — INSERT-only column grants for the
-- app role — becomes the right call once there is a second database role to
-- separate; Phase 0 has one, and an untested permission model is worse than none.
--
-- TRUNCATE is deliberately not blocked: `BEFORE UPDATE OR DELETE ... FOR EACH ROW`
-- does not fire on TRUNCATE, so test fixtures can still reset the table cheaply
-- (`src/test/database.ts` depends on this). No application code issues TRUNCATE.
-- Account erasure goes through the tombstone path on `users.deleted_at`; a future
-- hard purge must drop this trigger on purpose.
--
-- A correction is a NEW row with a negative `amount`, written through a dedicated
-- admin path. Never an edit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION xp_transactions_reject_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'xp_transactions is append-only (PRD §39): % is not permitted. A correction is a NEW row with a negative amount, written through a dedicated admin path — never an edit.',
    TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER xp_transactions_append_only
  BEFORE UPDATE OR DELETE ON xp_transactions
  FOR EACH ROW
  EXECUTE FUNCTION xp_transactions_reject_mutation();
