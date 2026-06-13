// Corsair CLI entry point shim — re-exports the shared corsair instance
// so the CLI auto-discovery finds it at src/corsair.ts
export { corsair } from "./integrations/corsair.js";
