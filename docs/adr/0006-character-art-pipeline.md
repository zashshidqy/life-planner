# ADR 0006 — Character Art Pipeline

**Status:** Accepted
**Date:** 2026-10-05
**Closes:** Roadmap §0.2.5

---

## Context

The product's identity is six characters. PRD §8 says so directly:

> Character bukan sekadar avatar. Character menjadi representasi identitas user
> di dalam Life Planner.
>
> *"Character is not just an avatar. Character is the representation of the user's
> identity inside Life Planner."*

DESIGN §15 makes the character the visual centrepiece and imposes a hard
technical constraint: each character must remain good-looking and recognizable at
**32px, 64px, 128px, and 512px**.

So the entire product identity depends on art that must work across a **16×
scale range** — a task icon at 32px and a share card at 512px — while also staying
distinct from each other (§8: "unique visual identity"). Roadmap risk #4 names the
specific failure: six characters that read as generic rather than distinctive.

The gap is that **there is no pipeline.** No source format, no scope, no tool, no
budget. Nothing says whether these are PNGs, hand-drawn SVGs, generated art, or
bought assets. And nothing in the spec says what happens to them — which is the
part that actually blocks Phase 1.

Three constraints make this decidable rather than a matter of taste:

1. **Free tier, no revenue.** ADR 0001 rules out anything requiring a paid art
   pipeline or an ongoing per-image service.
2. **§8 forbids stat differences.** "Character A = +20% XP" is prohibited outright.
   Any pipeline that ties art to mechanics is immediately disqualified.
3. **§9 has unlockable cosmetics.** Characters need secondary visual states
   later, which rules out a single fixed raster file per character.

## Decision

**Hand-authored parametric SVG React components. One component per character,
composed from shared parametric primitives. Verified by rendering at all four
required sizes, not by inspection at one.**

### Why SVG and not raster

The 32px→512px requirement is what decides this. A raster asset must be authored
or exported at each size, or scaled — and scaling a 32px PNG to 512px produces
blur that directly violates DESIGN §15's "scalable" requirement. A 512px PNG
downsampled to 32px loses the silhouette that made it recognizable. **Raster
cannot satisfy §15 by construction**; it can only be maintained, at four sizes,
per character, indefinitely.

Vector art resolves the range with one asset that is resolution-independent by
definition. The 16× constraint stops being a maintenance burden.

The additional wins, in rough order of importance:

- **Zero network cost.** Characters are in the JS bundle and in static assets —
  free and unmetered under Workers (ADR 0001), versus N×6 image requests.
- **Theming via CSS.** Palette comes from Tailwind tokens (DESIGN §43), so a
  character adapts to light/dark and to unlockable cosmetics without new assets.
- **No image pipeline at all.** `images.unoptimized: true` (ADR 0001) is already
  the whole image configuration, and SVG needs none of it.
- **§8 compliance is structural.** A character is a component that renders pixels.
  It cannot hold game logic, so "character A gets +20% XP" is not merely
  forbidden by policy — there is nowhere to put it.

### Why "parametric" and not six standalone SVG files

Six hand-drawn SVGs would satisfy the letter of §15 and fail the spirit of §15.
They would be six times the work, six times the bug surface, and any fix to a
shared problem (a stroke weight, a corner radius, a shadow) would have to be
applied six times — inconsistently.

So each character is a component built from **shared parametric primitives** with
character-specific parameters:

```text
<CharacterFigure
  palette={…}          // token references, not hex literals
  silhouette="round"    // shared geometry primitive
  headwear="none"
  accessory="glasses"
/>
```

A primitive is shared *geometry* — the body shape, the limb proportions, the
outline treatment. A character is the *parameterisation*. This makes §8's "unique
visual identity" a design constraint on parameters (silhouette, palette,
proportion, accessory) rather than on freehand illustration, which is exactly the
right axis: it forces distinctness to come from recognisable structural
differences instead of surface detail that dies at 32px.

It also makes §9's unlockable cosmetics nearly free — a cosmetic is another
parameter set, not another asset.

### The verification requirement is part of the decision

DESIGN §15 lists four sizes. The roadmap's Phase 1 exit criterion says
"verified by rendering each size and checking visually, **not by assuming**."

That phrasing exists because this is where art pipelines quietly fail: a character
that looks great at 512px is a grey blob at 32px, and nobody notices until the
character-select screen ships with a grid of six grey blobs. The failure is
invisible at the size the art is designed at.

So Phase 1 gets a **character gallery route** rendering all six at all four sizes
side by side, and that route is the artifact the exit criterion is judged against.
It is a test, in the sense that it exists to fail.

This is also where roadmap risk #4 gets addressed: six distinct silhouettes and
palettes, iterated while the cost is two days rather than six weeks.

### No generative art, no stock art, no image service

Rejected explicitly:

- **AI image generation** — inconsistent style across six characters, no vector
  output, unusable at 32px, and the "unique visual identity" requirement (§8) is
  exactly what generated sets are weakest at.
- **Stock/purchased assets** — licensing is per-character and per-size, not
  per-project; a free-tier project cannot rely on an asset whose terms change.
- **An external SVG service (SVGO pipeline, icon API)** — adds a network
  dependency and a failure mode to something that must render before anything
  else does. The PWA shell cannot afford a runtime dependency for its identity.
- **A design-tool export step** — reintroduces the raster problem and a
  non-deterministic artefact in the repo.

## Consequences

**Accepted:**

- Six characters is a real authoring cost, concentrated in Phase 1 rather than
  deferred. This is intentional: roadmap risk #4's mitigation is to iterate while
  the cost is days.
- SVG components are React code, so they are in the client bundle. Six parametric
  figures at a few KB each is not a bundle problem, but **the primitives must stay
  tree-shakeable** — one shared `CharacterFigure` imported by all six is correct;
  six copies of the geometry inlined is not.
- Hand-authored art needs an artist's eye. Six genuinely distinct, legible-at-32px
  silhouettes is design work, not typing. If it proves beyond one person in Phase 1,
  the honest response is fewer characters at higher quality, not six compromised
  ones — §8 wants six, but §15's legibility is the requirement that actually
  breaks, and a legible four is better than an illegible six.

**Accepted as the right trade:**

- No dedicated illustration tooling, no art pipeline in CI. The gallery route is
  manual visual verification, which means it depends on a human looking at it.
  That is a real weakness and is stated here rather than papered over.

**Not decided here, and deliberately:**

- **The six characters' actual identities** — names, personalities (§8 requires
  both), palettes. Those are product decisions, not architecture. This ADR fixes
  the *pipeline*; Phase 1 fixes the cast.
- **Whether characters are stored in the database.** Phase 0 has no character
  table, and adding one would be premature: a parametric component is code, not
  data. A `characters` table arrives when customisation (§9) needs server-side
  state — at which point it stores *selections and unlocks*, not geometry.

**Revisit trigger:**

If Phase 1 gallery review shows a character that cannot be made legible at 32px
without abandoning its silhouette, the options are (a) a size-specific simplified
variant — two assets per character, losing the parametric benefit, or (b) dropping
32px usage of characters entirely, since DESIGN §15 does not say *where* 32px is
required. Option (b) may be the right answer and is cheap to take now, expensive
after the gallery is built around 32px.