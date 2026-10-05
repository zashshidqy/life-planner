import type { Metadata } from "next";

import "./globals.css";

/**
 * Root layout.
 *
 * No `next/font` here on purpose. DESIGN §6 specifies the type direction and
 * Phase 1 turns it into tokens; loading a font now would be a Phase 1 decision
 * made in Phase 0, and `next/font/google` adds a network fetch to every build
 * for a font this page does not yet use. Phase 1 adds the real scale.
 *
 * `lang="en"` is the default locale. It becomes dynamic in Phase 1, when
 * bilingual routing lands — retrofitting `<html lang>` per request is a
 * rendering change, and the roadmap is right that it is cheaper to do once.
 */
export const metadata: Metadata = {
  title: "Life Planner",
  description: "A personal operating system for everyday life.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}