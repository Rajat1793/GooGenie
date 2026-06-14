/**
 * FeatureContext — fetches /v1/me/features once after sign-in and exposes
 * hasFeature(key) everywhere in the app without prop-drilling.
 *
 * This makes feature enforcement a first-class concern: nav items lock,
 * pages show "disabled" states, and AI buttons hide — all from one source.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { meApi, getDemoToken } from "../api/client.ts";
import { broadcastRequestUpdate } from "../hooks/useNotifications.ts";

interface FeatureState {
  /** Check if a specific feature is enabled for the current user */
  hasFeature: (key: string) => boolean;
  /** Raw feature toggle list */
  features: Array<{ featureKey: string; isEnabled: boolean }>;
  loading: boolean;
  /** Manually re-fetch (called after a request is approved) */
  refresh: () => void;
}

const FeatureCtx = createContext<FeatureState>({
  hasFeature: () => true, // default open before load
  features: [],
  loading: true,
  refresh: () => undefined,
});

export function FeatureProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useClerkAuth();
  const [features, setFeatures] = useState<Array<{ featureKey: string; isEnabled: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await meApi.getFeatures();
      setFeatures(r.features);
      setLoaded(true);
    } catch {
      // Don't lock everyone out on error — keep defaults open
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for Clerk or demo token
    if (!isLoaded && !getDemoToken()) return;
    if (!isSignedIn && !getDemoToken()) {
      setLoading(false);
      return;
    }
    // Prime the token getter then fetch
    const init = async () => {
      if (!getDemoToken()) {
        const token = await getToken().catch(() => null);
        if (!token) { setLoading(false); return; }
      }
      load();
    };
    init();
  }, [isSignedIn, isLoaded, getToken, load]);

  // Re-fetch when a feature request is decided (approved → feature flips on)
  useEffect(() => {
    window.addEventListener("googenie:feature-request-updated", load);
    return () => window.removeEventListener("googenie:feature-request-updated", load);
  }, [load]);

  function hasFeature(key: string): boolean {
    // Before features load, default open so we don't flash a lock screen
    if (!loaded) return true;
    const toggle = features.find((f) => f.featureKey === key);
    // If a toggle entry exists, use it; if missing entirely, default open
    return toggle ? toggle.isEnabled : true;
  }

  return (
    <FeatureCtx.Provider value={{ hasFeature, features, loading, refresh: load }}>
      {children}
    </FeatureCtx.Provider>
  );
}

export function useFeatures(): FeatureState {
  return useContext(FeatureCtx);
}

// Convenience: broadcast + refresh after a request is created/decided
export function notifyFeatureChange() {
  broadcastRequestUpdate();
}
