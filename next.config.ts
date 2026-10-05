import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Jalankan Miniflare proxy hanya di mode development
if (process.env.NODE_ENV === "development") {
  initOpenNextCloudflareForDev();
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    unoptimized: true,
  },

  env: {
    APP_TARGET: "cloudflare-workers",
  },

  // No `webpack` key. Next 16 runs Turbopack by default and treats a `webpack`
  // config as a misconfiguration:
  //
  //   "This build is using Turbopack, with a `webpack` config and no
  //    `turbopack` config."
  //
  // A previous version of this file set `watchOptions.ignored` to keep the dev
  // watcher out of `.open-next/`, `.next/`, and `.wrangler/`. Turbopack does not
  // need it — it honours .gitignore when choosing what to watch, and all three
  // directories are gitignored. Restoring those options would mean either
  // abandoning Turbopack (`--webpack`, slower HMR) or expressing them as
  // `turbopack.rules` conditions, which is more machinery for a problem that does
  // not exist.
};

export default nextConfig;