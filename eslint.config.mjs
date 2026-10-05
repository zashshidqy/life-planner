import next from "eslint-config-next/typescript";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * Flat ESLint config.
 *
 * Kept intentionally thin. Phase 0 has one page and a few modules; a large
 * ruleset here would generate noise nobody reads and suppress signals later.
 * `eslint-config-next` supplies the framework rules (hooks, server/client
 * boundaries, Next 16 conventions).
 *
 * Note on the server-only boundary: the rule that matters here — "a Client
 * Component must not import a domain service" — is NOT implemented here. An
 * earlier version of this file used `no-restricted-imports` for it, which is the
 * usual trick, and it was wrong: the pattern matched server modules importing
 * each other, so nine of the first eleven lint errors were the boundary rule
 * forbidding the boundary. The real mechanism is the `server-only` marker
 * package, imported at the top of `src/server/database/client.ts` and each
 * service entry point. It is enforced by the bundler, it fails at build time
 * rather than review time, and it cannot be configured wrong.
 */
const config = [
  {
    ignores: [
      ".next/**",
      ".open-next/**",
      "coverage/**",
      "node_modules/**",
      "next-env.d.ts",
      "drizzle/**", // generated + hand-appended migration SQL, not source
    ],
  },
  ...next,
  ...nextCoreWebVitals,
  {
    files: ["src/server/**/*.ts", "src/lib/**/*.ts", "scripts/**/*.ts"],
    ignores: ["**/__tests__/**", "**/*.test.ts"],
    rules: {
      // An empty catch is how a failed XP write becomes invisible. PRD §12 leans
      // on server-side validation, which means nothing may swallow the failure.
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      // Test doubles and fixtures legitimately produce values the linter would
      // otherwise flag as unused.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];

export default config;