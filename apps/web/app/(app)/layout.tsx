"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { FeatureProvider } from "../../src/contexts/FeatureContext";
import { Shell } from "../../src/components/Shell";
import { ClerkTokenWirer } from "../../src/components/ClerkTokenWirer";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FeatureProvider>
        <ClerkTokenWirer />
        <Shell>{children}</Shell>
      </FeatureProvider>
    </AuthProvider>
  );
}

