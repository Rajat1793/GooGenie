"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { FeatureProvider } from "../../src/contexts/FeatureContext";
import { KeybindingProvider } from "../../src/contexts/KeybindingContext";
import { Shell } from "../../src/components/Shell";
import { ClerkTokenWirer } from "../../src/components/ClerkTokenWirer";
import { KeybindingsModal } from "../../src/components/KeybindingsModal";
import { KeybindingRouterBridge } from "../../src/components/KeybindingRouterBridge";
import { UndoSendToast } from "../../src/components/UndoSendToast";
import { CommandPalette } from "../../src/components/CommandPalette";
import { DemoTour } from "../../src/components/DemoTour";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <FeatureProvider>
        <KeybindingProvider>
          <ClerkTokenWirer />
          <KeybindingRouterBridge />
          <Shell>{children}</Shell>
          <CommandPalette />
          <KeybindingsModal />
          <UndoSendToast />
          <DemoTour />
        </KeybindingProvider>
      </FeatureProvider>
    </AuthProvider>
  );
}

