/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#2b6389",
        "on-primary": "#ffffff",
        "primary-container": "#8cc0eb",
        "on-primary-container": "#0d4f74",
        secondary: "#466272",
        "on-secondary": "#ffffff",
        "secondary-container": "#c6e4f7",
        "on-secondary-container": "#4a6677",
        tertiary: "#835418",
        "on-tertiary": "#ffffff",
        "tertiary-container": "#ecae6a",
        "on-tertiary-container": "#6c4003",
        background: "#f8f9fd",
        "on-background": "#191c1e",
        surface: "#f8f9fd",
        "on-surface": "#191c1e",
        "on-surface-variant": "#41474e",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f3f3f7",
        "surface-container": "#edeef1",
        "surface-container-high": "#e7e8eb",
        "surface-container-highest": "#e1e2e6",
        "surface-variant": "#e1e2e6",
        "outline": "#71787f",
        "outline-variant": "#c1c7cf",
        "error": "#ba1a1a",
        "on-error": "#ffffff",
        "error-container": "#ffdad6",
        "on-error-container": "#93000a",
        "inverse-surface": "#2e3133",
        "inverse-on-surface": "#f0f0f4",
        "peach-accent": "#FFEBCC",
        "cream-bg": "#FFF9D2",
        "ink-text": "#2D3436",
        "primary-fixed-dim": "#98ccf8",
        "tertiary-fixed-dim": "#faba75",
        "on-tertiary-fixed": "#2c1700",
        "on-tertiary-fixed-variant": "#683d00"
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "sans-serif"],
        headline: ["EB Garamond", "Caudex", "serif"]
      },
      borderRadius: {
        DEFAULT: "0.125rem",
        lg: "0.25rem",
        xl: "0.5rem",
        "2xl": "1rem",
        full: "9999px"
      }
    }
  },
  plugins: []
};
