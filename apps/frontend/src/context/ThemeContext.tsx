import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { STORAGE_KEYS } from "../lib/storage.ts";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {}
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.theme) as Theme | null;
    return saved ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
