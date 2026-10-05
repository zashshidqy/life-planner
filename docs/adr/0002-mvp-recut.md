# ADR 0002 — MVP Re-cut

**Status:** Accepted
**Date:** 2026-10-05
**Closes:** Roadmap §0.2.1

---

## Context

PRD §46 lists fourteen things as MVP-mandatory:

```text
Authentication · Onboarding · Character Selection · Dashboard · Tasks ·
Goals · Habits · Calendar · XP · Level · Primary Streak · Achievements ·
Basic Profile · PWA
```

The same section then closes with:

> Jangan membangun seluruh feature set sekaligus.
>
> *"Do not build the entire feature set all at once."*

That is a contradiction inside a single section. Fourteen features — including a
calendar, a goal system, and an installable PWA — is not an MVP; it is a V1
arriving without an MVP in front of it.

The sentence that follows the list is the one that matters, and it is the reason
this is a real problem rather than a pedantic one. **A roadmap that names no
exclusions cannot be used to say no.** Every one of those fourteen items will
have a plausible argument for why it is the one that cannot wait — and with the
PRD as the only artefact, there is nothing to point at when someone says "we
also need Projects."

PRD §50 lists non-goals, which helps. But §50's non-goals are about scope
*philosophy* ("not accounting software, not a social network"), not about what
ships in which release. They cannot settle "should Calendar be in the MVP."

## Decision

**The MVP is re-cut to a single demonstrable loop, and everything else is
explicitly deferred with a named phase.**

The product is defined by PRD §51:

```text
PLAN → DO → EARN XP → LEVEL UP → BUILD STREAK → UNLOCK ACHIEVEMENT →
REFLECT → SHARE PROGRESS → RETURN → PLAN AGAIN
```

An MVP is not fourteen features. It is **one traversal of that loop that a real
person can complete on a real phone**, because the loop — not the feature list —
is the thing being tested. If the loop is not satisfying, no amount of Calendar
will save the product. Roadmap risk #1 states this directly.

### MVP (Phase 3 of the roadmap)

```text
Register / login
  → Onboarding-lite (username + character select)
  → Dashboard (level · XP bar · streak · today's progress)
  → Tasks (create, list, complete)
  → complete triggers: XP ledger insert → projection update →
                        level-up → achievement unlock → "+25 XP" toast
  → PWA installable (manifest, service worker, offline READ-ONLY)
```

One activity type. Tasks only, because tasks are the cheapest thing that can
carry XP, and because every other activity type can be added afterwards by
reusing the exact same ledger write.

### Deferred, with the reason

| PRD §46 item | Deferred to | Why not in the MVP |
|---|---|---|
| Goals | Phase 4 | A goal needs milestones, which need their own UI. It is a *container* for XP sources, not a source. |
| Habits | Phase 4 | Needs a frequency/measurement model (§24) with three measurement types. Its own design problem. |
| Calendar | Phase 4 | Largest UI surface of the fourteen, and orthogonal to the loop. It shows *when*; the loop is about *what happened*. |
| PWA offline | Phase 3 reads, Phase 4 writes | §36 vs §37 contradiction — see ADR 0003. |

### What this does not cut

Account creation, login, a dashboard, XP, level, and streak all stay. Those are
not features; they are the loop. Achievements stay in MVP in their simplest form
— unlocked automatically by streak and level — because an achievement that fires
is the cheapest possible proof that the loop closes. Character selection stays
because it is three screens of identity work with no logic risk, and DESIGN §13
makes the character the visual centrepiece; shipping the loop without it would
test a product that does not exist in the PRD.

### Concretely, this re-cut means

Phase 3's exit criterion is a sentence a human can evaluate:

> A real user registers, picks a character, completes a task, watches XP land,
> levels up, and installs the PWA to their home screen. Works on a real phone on
> a real network.

Not "MVP complete." Not "all §46 features shipped." One sentence, pass or fail.

## Consequences

**Accepted:**

- Some people will read §46 and think this MVP is too small. That is the point of
  writing it down.
- Goals and Habits are productively important and are visibly absent from the
  first demo. §15 ("today's progress") is consequently limited to planned tasks
  in MVP; the PRD's "4/6 planned activities" framing implies more sources than
  exist yet. The dashboard copy must not promise what is not there — that is a
  Phase 3 content requirement, and it interacts with the bilingual string-length
  risk noted in the roadmap.

**Why one activity type rather than two:**

Adding a second XP source is not a feature, it is a one-line change plus a
config row. Adding a *second kind of object* — habits with frequency and
measurement — is a design and schema change. Doing one proves the ledger is
source-agnostic; doing four at once proves nothing, because a failure in any one
of them looks identical.

**Why not "vertical slice" as a phase name:**

The roadmap already calls Phase 3 that. This ADR does not need a different word;
it needs the *definition* of the slice written down, because "vertical slice"
without an explicit list is exactly the kind of phrase that grows.

**Revisit trigger:**

If Phase 3 exits and the loop is not satisfying — users complete a task and do not
come back — then the problem is the loop, not the feature list, and adding
Calendar would make it worse. Roadmap risk #1 puts this at week ~3 for exactly
that reason.