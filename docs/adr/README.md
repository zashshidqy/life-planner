# Architecture Decision Records

Every significant decision in this project is recorded here before it is
implemented. The point is not documentation — it is that a decision with a
*reason* survives contact with the next person who thinks they have a better
idea. Most of the entries below exist because the obvious alternative was
seriously considered and lost.

## Index

| # | Title | Status | Closes |
|---|---|---|---|
| [0001](0001-platform.md) | Platform: Cloudflare Workers, Neon, Drizzle, Better Auth, Resend | Accepted | — |
| [0002](0002-mvp-recut.md) | MVP re-cut: 14 features is not an MVP | Accepted | Roadmap §0.2.1 |
| [0003](0003-offline-sequencing.md) | Offline sequencing: reads in Phase 3, writes after conflict resolution is designed | Accepted | Roadmap §0.2.2 |
| [0004](0004-system-config.md) | `system_config`: one flat typed key/value table | Accepted | Roadmap §0.2.3 |
| [0005](0005-analytics-events.md) | `analytics_events` and `analytics_sessions`: making §49 measurable | Accepted | Roadmap §0.2.4 |
| [0006](0006-character-art-pipeline.md) | Characters: parametric SVG React components, verified at 32/64/128/512px | Accepted | Roadmap §0.2.5 |
| [0007](0007-engineering-practice.md) | Repository, testing, CI, and deploy practice | Accepted | Roadmap §0.2.6 |

## Format

Each record states **context**, **decision**, and **consequences** — including the
consequences nobody wanted. A record that only lists upsides is marketing.

An ADR is superseded, not edited. When a decision changes, the old file gets
`Status: Superseded by ADR-NNNN` at the top and a new record is written. The
history is the point: the question "why is it like this" usually has an answer
three records back, and deleting that answer is how the same mistake gets made
twice.

## Relationship to the PRD

`docs/PRD.md` and `docs/DESIGN.md` are the source of truth for **what** the
product is. These records cover **how and when** it gets built, and where the two
documents contradict each other or contradict the platform.

Where an ADR resolves a genuine contradiction in the specs, it says so
explicitly and names the sections involved. Where an ADR defers a decision to a
later phase, it says which phase and what would have to be true to decide it
earlier.