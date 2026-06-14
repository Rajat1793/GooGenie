import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/v1": "http://localhost:4000",
      "/health": "http://localhost:4000"
    }
  },
  build: {
    // Split vendor chunks so the app shell loads independently of heavy deps
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-clerk": ["@clerk/react"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-react": ["react", "react-dom", "react-router-dom"],
        }
      }
    }
  }
});
