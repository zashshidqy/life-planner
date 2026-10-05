import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the `@/*` path alias in tsconfig.json. Vitest does not read
      // tsconfig paths, so it has to be repeated here. If the alias is ever
      // changed in one place and not the other, every import in the suite
      // resolves to a 404-shaped error — cheap to spot, but annoying.
      "@": fileURLToPath(new URL("./src", import.meta.url)),

      // `server-only` throws unless the bundler resolves the `react-server`
      // export condition, which Next sets and Vitest does not. Point it at the
      // package's no-op entry so the server-only guard on `client.ts` and
      // `award-xp.ts` does not fail every test at import time. The guard's real
      // value is at bundle time; the tests are running under Node, where these
      // modules are server-side by definition.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },

  test: {
    environment: "node",

    // The suite runs against PGlite — a real PostgreSQL engine in-process — not a
    // mock, because the property under test is a database constraint. One file
    // at a time because fixtures truncate shared tables; once each file gets its
    // own schema this can be revisited.
    fileParallelism: false,
    sequence: { concurrent: false },

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",

      // Only instrument code we wrote. Node modules, the Next.js runtime, and
      // the Drizzle client are not ours to cover, and reporting them would bury
      // the numbers that matter.
      include: ["src/server/**/*.ts", "src/lib/**/*.ts"],
      exclude: [
        "src/server/database/schema/**", // declarative DDL; covered by migrations
        "src/test/**",
        "**/*.d.ts",
      ],

      thresholds: {
        // Roadmap §Phase 2 requires 100% branch coverage on
        // `server/services/progression/*`. Enforced from the start rather than
        // retrofitted, so the progression code gets written test-first instead of
        // being chased up to a number afterwards.
        "src/server/services/progression/**": {
          branches: 100,
          functions: 100,
          lines: 100,
          statements: 100,
        },
        // Everything else we own starts from a floor, not a ceiling.
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
      },
    },
  },
});