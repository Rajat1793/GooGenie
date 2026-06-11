import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));

export default {
  plugins: {
    tailwindcss: { config: join(__dir, "tailwind.config.js") },
    autoprefixer: {}
  }
};
