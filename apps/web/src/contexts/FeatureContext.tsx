"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { meApi, getDemoToken } from "../api/client";
import { broadcastRequestUpdate } from "../hooks/useNotifications";

interface FeatureState {
  hasFeature: (key: string) => boolean;
  features: Array<{ featureKey: string; isEnabled: boolean }>;
  loading: boolean;
  refresh: () => void;
}

const FeatureCtx = createContext<FeatureState>({
  hasFeature: () => true,
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
      /* keep defaults open on error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded && !getDemoToken()) return;
    if (!isSignedIn && !getDemoToken()) {
      setLoading(false);
      return;
    }
    const init = async () => {
      if (!getDemoToken()) {
        const token = await getToken().catch(() => null);
        if (!token) {
          setLoading(false);
          return;
        }
      }
      load();
    };
    init();
  }, [isSignedIn, isLoaded, getToken, load]);

  useEffect(() => {
    window.addEventListener("googenie:feature-request-updated", load);
    return () => window.removeEventListener("googenie:feature-request-updated", load);
  }, [load]);

  function hasFeature(key: string): boolean {
    // Until the feature list has come back from the server we default to
    // TRUE so shell pages (calendar, inbox) don't flash a "Locked" card
    // for a render before features arrive. Once `loaded` flips, the real
    // toggle wins. Add-on panels (DigestPanel, TasksPanel) gate themselves
    // on `loaded` separately so they don't fire 403-prone fetches early.
    if (!loaded) return true;
    const toggle = features.find((f) => f.featureKey === key);
    return toggle ? toggle.isEnabled : true;
  }

  return (
    <FeatureCtx.Provider value={{ hasFeature, features, loading, refresh: load }}>{children}</FeatureCtx.Provider>
  );
}

export function useFeatures(): FeatureState {
  return useContext(FeatureCtx);
}

export function notifyFeatureChange() {
  broadcastRequestUpdate();
}
