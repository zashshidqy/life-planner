# ADR 0003 — Offline Sequencing

**Status:** Accepted
**Date:** 2026-10-05
**Closes:** Roadmap §0.2.2

---

## Context

PRD §36 and §37 contradict each other, and neither one is sequenced.

**§36 (Offline PWA)** places offline support in MVP, and it is not a light
requirement — eight of the eight listed operations are writes:

```text
View dashboard · View tasks · Create task · Complete task
View habits · Complete habit · View calendar · Create journal
```

`Create task`, `Complete task`, `Complete habit`, and `Create journal` all
require queued local writes and a sync mechanism. So §36 is a request for
offline *writes*, in the first release.

**§37 (Sync System)** draws a five-hop pipeline ending at the database, and then
closes with a hard ordering requirement:

> Conflict resolution harus dirancang sebelum implementasi offline penuh.
>
> *"Conflict resolution must be designed before full offline implementation."*

§37 does not say what the conflict resolution *is*. It states the precondition
without supplying the conclusion, so the ordering constraint is real and the
thing it depends on is missing.

The gap is that "offline" is one word covering two very different engineering
problems. Reading a cached copy is a rendering concern that a service worker
solves in an afternoon. Reconciling two divergent copies of the truth is a
distributed-systems problem with no universally correct answer, and this
product has unusually bad inputs for it.

**The XP ledger makes it worse, not better.** PRD §39 makes `xp_transactions`
append-only and the source of truth, and Phase 0's unique constraint
`(user_id, source_type, source_id)` means a completed task earns XP exactly once.
That constraint is a gift for idempotent replay — a sync engine can safely
re-deliver the same completion, and the database absorbs the duplicate. But it
gives no answer to the *ordering* question: a task completed at 09:00 offline and
synced at 17:00 is a different fact from one completed at 17:00, and if the same
task was completed twice offline the unique index collapses them into one XP
award while the user believes they earned two. That is a correctness problem in
the product's most emotionally-loaded number, and it is invisible until someone
complains.

Two of the four queued write types compound this. A **streak** (§16) is
date-keyed: an offline completion crossed midnight, and the sync lands it on the
wrong day, silently rewriting history. A **journal entry** (§26, §44) is
private, sensitive content whose admin access is already flagged as a legal
question in roadmap risk #8 — and offline storage means it also sits in
IndexedDB on a shared or backed-up device.

Roadmap §2.3 also notes the ledger grows forever, which means any sync design
eventually needs a retention story. That is a Phase 4 conversation, not a Phase 3
one, but it is the same conversation.

## Decision

**Split offline into reads and writes. Ship reads in Phase 3. Writes wait until
the conflict-resolution design document exists in Phase 4 — and the design
document comes before the write queue, not in parallel with it.**

Concretely:

| Capability | Phase | Content |
|---|---|---|
| App shell + manifest + service worker | 3 | Caches the shell so the app *opens* offline |
| Offline **reads** | 3 | Dashboard, tasks, and profile render from cache with a stale marker |
| Conflict-resolution design doc | 4 | Written, reviewed, and tested against a real divergence before code |
| Offline **write** queue + sync engine | 4 | Only after the above is settled |

### Why reads first is a real result, not a placeholder

An offline-readable PWA already answers the question users actually ask, which
is *"does this app work on my phone?"* — the manifest installs, the shell opens
with no network, and yesterday's dashboard and task list are there. That is the
Phase 3 exit criterion and it is unaffected by the absence of writes.

The absence of writes is *visible and honest*: completing a task offline shows a
disabled control with a clear "needs connection" message. That is a worse
experience than queuing the write, and it is a **better** experience than a
write queue with no conflict strategy, which produces a task that appears to
complete and then vanishes or double-counts later.

### The four questions Phase 4 must answer first

Stated here so the design doc has a checklist and so nobody starts building
against an unwritten strategy:

1. **Ordering.** Is `created_at` from the client clock or the server clock? If a
   user completes a task offline at 23:50 and syncs at 00:10, which day owns it?
   Client clocks are wrong and user-editable; server clocks are authoritative but
   lose the offline ordering that made the queue necessary in the first place.
2. **Idempotency vs. multiplicity.** The unique constraint collapses two genuine
   offline completions into one XP award. Is that correct (a task can only be
   completed once, so yes) or is it a silent loss (the user believes they earned
   2×10 XP)? The answer determines whether the client must also dedupe before
   sync.
3. **Tombstones.** Offline deletion is a write. Without a tombstone, a delete that
   happened offline can be resurrected by a stale sync. This requires a
   `deleted_at` column on every syncable table — which means the schema decision
   is needed *before* Phase 3, not during Phase 4.
4. **Staleness UI.** How does the user know an offline read is offline? A cached
   dashboard showing yesterday's streak with no marker is worse than an error
   state, because it is confidently wrong.

### The schema consequence, and why it cannot wait

Question 3 is the reason this ADR cannot simply say "offline is later." **Tombstone
columns must exist before there is data to migrate.** Adding `deleted_at` to
`tasks` after 10,000 rows exist is a migration plus a backfill plus a partial-
unique-index rebuild; adding it to the table definition is a line of Drizzle.

**This ADR does not add those columns today, and that is a limitation of where it
is being written, not a decision.** Phase 0's schema is the progression core
(ADR 0001 §Schema scope) — `users`, `user_progression`, `xp_transactions`,
`streaks`, `streak_events`, `achievements`, `user_achievements`, `system_config`,
`analytics_events`, `analytics_sessions`. **There is no user-authored entity in it
yet.** No `tasks`, no `habits`, no `journal_entries`. Every Phase 0 table is
server-authoritative, so there is nothing to tombstone and nothing to sync.

What this ADR does instead is make the requirement unmissable:

- The **first** user-authored table — `tasks`, in Phase 3 — gets `deleted_at` and
  a partial unique index from its defining migration, not from a later one.
- That is a **binding requirement on Phase 3**, not an optional note.
- If Phase 3 ships `tasks` without it, Phase 4 opens with a data migration and
  this ADR's Phase 4 timeline is wrong.

The reason to record it here rather than in a Phase 4 note: the failure mode is
silent resurrection of deleted data, discovered by a user, after the data exists.
Cheap to require now, expensive to retrofit.

### Rejected alternatives

**Implement full offline in Phase 3 as §36 literally says.** Rejected: §37
forbids it in the same document. Building a write queue first and designing
conflict resolution afterwards inverts the PRD's own stated ordering, and the
inversion produces silent data loss — the roadmap's single largest engineering
risk, currently scheduled into the first release.

**Skip offline entirely in MVP.** Rejected: §36 is right that a life planner that
white-screens in a lift is not usable, and the target user (§4) is on mobile
throughout the day. Offline *reads* get the reliability benefit at a fraction of
the risk. Dropping the requirement would be trading a real user problem for a
convenient schedule.

**Local-first with CRDTs.** Rejected as disproportionate. CRDTs solve concurrent
edits to shared documents — collaboration, counters, set membership. This app's
writes are overwhelmingly single-writer, idempotent, and already constrained by a
unique index. The complexity would be spent on a problem the schema has already
mostly prevented.

**IndexedDB as the primary store with the server as a replica.** Rejected: PRD §39
makes the server ledger the source of truth, and a local-first primary store inverts
that. Any such design must guarantee the ledger is faithfully reconstructed, which
means the local store is the source of truth for writes anyway — so the honest
version is "offline queue," which is what Phase 4 builds.

## Consequences

**Accepted:**

- MVP does not fully satisfy §36's list. Four of its eight operations require a
  connection in the first release. **This is a known, deliberate gap and it should
  be visible in the product, not hidden** — the offline state must say so.
- `deleted_at` exists on syncable tables before anything uses it, which will look
  like dead schema in Phase 2 review. It is annotated as such.
- Phase 4 carries the largest single engineering risk in the project. It is 2–3
  weeks of schedule and it is gated on a design document, so the document gets
  written *before* Phase 3's demo is called a success, not after.
- The `xp_transactions` unique constraint is load-bearing for sync replay and must
  not be "simplified" away.

**Accepted as the right trade:**

- A user who completes a task in a dead spot gets an error instead of a
  queued write. For a motivational product (§3, DESIGN §48) an honest failure is
  better than a silent one.

**Revisit trigger:**

If Phase 3 telemetry shows a meaningful share of sessions with connectivity
problems — not "the app is slow" but "the app would not open" — offline writes
move earlier and the conflict design gets written immediately. The measurement
comes from `analytics_events` (ADR 0005), which is another reason that table is in
the schema now rather than Phase 4 as the roadmap originally scheduled it.