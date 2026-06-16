import { corsair, setupCorsair } from "../src/integrations/corsair.js";

await setupCorsair(corsair);
console.log("Corsair DB initialized ok");
process.exit(0);
