import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    join(__dir, "index.html"),
    join(__dir, "src/**/*.{ts,tsx}")
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // All mapped to CSS variables — values switch via :root / .dark
        background:                   "var(--c-background)",
        surface:                      "var(--c-surface)",
        "surface-dim":                "var(--c-surface-dim)",
        "surface-bright":             "var(--c-surface-bright)",
        "surface-container-lowest":   "var(--c-surface-container-lowest)",
        "surface-container-low":      "var(--c-surface-container-low)",
        "surface-container":          "var(--c-surface-container)",
        "surface-container-high":     "var(--c-surface-container-high)",
        "surface-container-highest":  "var(--c-surface-container-highest)",
        "surface-variant":            "var(--c-surface-variant)",
        "on-surface":                 "var(--c-on-surface)",
        "on-surface-variant":         "var(--c-on-surface-variant)",
        "inverse-surface":            "var(--c-inverse-surface)",
        "inverse-on-surface":         "var(--c-inverse-on-surface)",
        outline:                      "var(--c-outline)",
        "outline-variant":            "var(--c-outline-variant)",
        primary:                      "var(--c-primary)",
        "on-primary":                 "var(--c-on-primary)",
        "primary-container":          "var(--c-primary-container)",
        "on-primary-container":       "var(--c-on-primary-container)",
        "primary-fixed":              "var(--c-primary-fixed)",
        "primary-fixed-dim":          "var(--c-primary-fixed-dim)",
        secondary:                    "var(--c-secondary)",
        "on-secondary":               "var(--c-on-secondary)",
        "secondary-container":        "var(--c-secondary-container)",
        "on-secondary-container":     "var(--c-on-secondary-container)",
        tertiary:                     "var(--c-tertiary)",
        "on-tertiary":                "var(--c-on-tertiary)",
        "tertiary-container":         "var(--c-tertiary-container)",
        "on-tertiary-container":      "var(--c-on-tertiary-container)",
        "tertiary-fixed-dim":         "var(--c-tertiary-fixed-dim)",
        error:                        "var(--c-error)",
        "on-error":                   "var(--c-on-error)",
        "error-container":            "var(--c-error-container)",
        "on-error-container":         "var(--c-on-error-container)",
        // Brand extras
        "ink-text":                   "var(--c-ink-text)",
        "peach-accent":               "#FFEBCC",
        "cream-bg":                   "#FFF9D2",
      },
      fontFamily: {
        sans:        ["var(--font-body)", "sans-serif"],
        headline:    ["var(--font-headline)", "serif"],
        "body-md":   ["var(--font-body)", "sans-serif"],
        "label-md":  ["var(--font-body)", "sans-serif"],
        "label-sm":  ["var(--font-body)", "sans-serif"],
        "headline-sm": ["var(--font-headline)", "serif"],
        "headline-md": ["var(--font-headline)", "serif"],
        "display-lg":  ["var(--font-headline)", "serif"],
      },
      borderRadius: {
        DEFAULT: "var(--radius-sm)",
        lg:      "var(--radius-lg)",
        xl:      "var(--radius-xl)",
        "2xl":   "var(--radius-2xl)",
        full:    "9999px"
      }
    }
  },
  plugins: []
};
