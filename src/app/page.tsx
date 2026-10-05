/**
 * Phase 0 placeholder page.
 *
 * This is not a feature and is not styled. Its only job is to prove three things
 * at once:
 *
 *   1. The app compiles and serves on the Cloudflare Workers target.
 *   2. The route is **statically prerendered**. That is the whole architecture
 *      (ADR 0001): the shell is emitted to `.open-next/assets` and served by
 *      Cloudflare's asset pipeline, which costs zero Workers requests and zero
 *      CPU. `pnpm build` reports the route as `○` (Static) rather than `ƒ`
 *      (Dynamic). If a future change flips this to dynamic, the 10 ms CPU budget
 *      per invocation starts being spent on rendering instead of on a query.
 *   3. Semantic HTML renders, so the accessibility floor (DESIGN §41) has
 *      something to attach to.
 *
 * No Tailwind classes. DESIGN §43 makes tokens the only source of visual values,
 * and those tokens are Phase 1. Styling this page with arbitrary utilities would
 * establish exactly the precedent DESIGN §43 forbids.
 */
export default function Home() {
  return (
    <main>
      <h1>Life Planner</h1>
      <p>
        Phase 0 — repository, platform decisions, and the progression schema. No product
        features yet.
      </p>
      <p>
        See <code>docs/adr/</code> for the architecture decisions and <code>README.md</code>{" "}
        for local setup.
      </p>
    </main>
  );
}