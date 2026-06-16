/**
 * Phase 11 — Next.js standalone output doesn't auto-copy static assets.
 * Manually copy .next/static and public/ into the standalone artifact so
 * `node .next/standalone/apps/web/server.js` can serve them.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dir, "..");
const standaloneRoot = path.join(appRoot, ".next", "standalone", "apps", "web");

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

(async () => {
  if (!(await exists(standaloneRoot))) {
    console.warn(`[postbuild] standalone artifact not found at ${standaloneRoot} — skipping copy.`);
    process.exit(0);
  }
  const staticSrc = path.join(appRoot, ".next", "static");
  const publicSrc = path.join(appRoot, "public");
  if (await exists(staticSrc)) {
    await copyDir(staticSrc, path.join(standaloneRoot, ".next", "static"));
    console.log("[postbuild] copied .next/static → standalone");
  }
  if (await exists(publicSrc)) {
    await copyDir(publicSrc, path.join(standaloneRoot, "public"));
    console.log("[postbuild] copied public → standalone");
  }
})();
