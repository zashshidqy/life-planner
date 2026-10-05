import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter configuration for Cloudflare Workers.
 *
 * ## Why `buildCommand` is attached AFTER `defineCloudflareConfig()`
 *
 * Required, and getting it wrong is a silent infinite loop rather than an error.
 *
 * `defineCloudflareConfig()` takes a `CloudflareOverrides` object — a *fixed* key
 * set of `incrementalCache`, `tagCache`, `queue`, `cachePurge`,
 * `enableCacheInterception`, and `routePreloadingBehavior`. It destructures those
 * keys and returns a **freshly built** object literal. Anything else passed in is
 * silently discarded: `buildCommand` is not in that key set, so putting it inside
 * the call has no effect whatsoever, and `tsc` correctly rejects it with TS2353.
 *
 * `buildCommand` is a top-level `OpenNextConfig` key, so it has to be spread onto
 * the returned object.
 *
 * ### Why it is needed at all
 *
 * `@opennextjs/aws` `build/buildNextApp.js` reads
 * `config.buildCommand ?? \`${packager} build\``. The packager here is pnpm, so the
 * default is `pnpm build` — which *is* `opennextjs-cloudflare build`. Left alone,
 * `pnpm build` spawns a build that spawns a build: the log fills with
 * "Building Next.js app" indefinitely (observed 59 headers before being killed)
 * and `.open-next/worker.js` is never written. It hangs rather than failing, so
 * CI would hang too.
 *
 * Pointing it at `pnpm build:next` makes the recursion impossible by construction:
 * the command the adapter invokes can no longer reach the adapter's own script.
 *
 * Do not "simplify" this back into the call argument. The result is a build that
 * hangs with no error, which is the worst possible failure mode to debug.
 */
const base = defineCloudflareConfig({
  /**
   * ## Why `incrementalCache: "dummy"`
   *
   * The product architecture (docs/adr/0001-platform.md) is:
   *
   *     static app shell  -> served from Workers static assets   (0 CPU)
   *     client-rendered   -> fetches into the browser           (0 CPU)
   *     thin server write -> one indexed read + one insert       (<10ms CPU)
   *
   * Nothing in that shape revalidates. There is no ISR, no `revalidate` tag, no
   * on-demand regeneration — the dashboard is a client island, not a server
   * render. A real incremental cache would therefore be an unused resource that
   * still costs a binding, a bucket, and a class of failure mode we would have to
   * reason about.
   *
   * The `"dummy"` override makes that explicit instead of implicit: the adapter
   * will not silently revalidate anything, and when the first feature that needs
   * it lands, the replacement is a one-line change to
   * `static-assets-incremental-cache` (which serves prerendered output straight
   * out of the static-assets directory, still 0 CPU and 0 Workers requests) or
   * `regional-cache` (in-isolate memory, also 0 requests).
   *
   * Do not swap in `r2-incremental-cache` without reading docs/adr/0001-platform.md
   * §"Cache strategy" — it adds an R2 bucket to the account and a read per lookup.
   */
  incrementalCache: "dummy",

  // Route preloading is the other documented way to burn cold-start CPU.
  // "none" is the default; stated here so it is a decision, not an omission.
  routePreloadingBehavior: "none",
});

/**
 * Named rather than exported inline: `import/no-anonymous-default-export` flags an
 * anonymous default export, and an inline object literal here is hard to read past
 * anyway given how much comment sits above it.
 */
const config = { ...base, buildCommand: "pnpm build:next" };

export default config;