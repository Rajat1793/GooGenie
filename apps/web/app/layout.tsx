import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";

import "../src/styles/index.css";
import { QueryProvider } from "../src/components/QueryProvider";
import { ThemeProvider } from "../src/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "GooGenie",
  description: "AI-first Gmail + Calendar workspace with RBAC",
};

/**
 * Inline script to set the initial theme class BEFORE first paint, avoiding
 * the flash-of-unstyled-content described in migration_plan.md Phase 5 step 26.
 */
const themeBootstrap = `
(function() {
  try {
    var t = localStorage.getItem('nimbus-theme') || 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch (_) {}
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider afterSignOutUrl="/">
      <html lang="en" suppressHydrationWarning>
        <head>
          {/* Unified Superhuman-style typography across the marketing surface
              AND the in-app shell. Inter handles dense body copy at 13–16px;
              Space Grotesk is the headline / display face. Both are wired
              into the CSS variables --font-body / --font-headline in
              src/styles/index.css. */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link
            href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
            rel="stylesheet"
          />
          <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        </head>
        <body
          className="min-h-screen bg-background text-on-surface antialiased"
          // Browser extensions (Grammarly, Honey, etc.) inject attributes
          // like `data-new-gr-c-s-check-loaded` into <body> before React
          // hydrates, causing a hydration warning that can't be fixed in
          // user code. `suppressHydrationWarning` silences it for direct
          // attribute mismatches on this element only.
          suppressHydrationWarning
        >
          <ThemeProvider>
            <QueryProvider>{children}</QueryProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
