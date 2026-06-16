/**
 * Mechanical import rewriter for apps/web — converts Vite/React-Router/Clerk-React
 * patterns to Next.js + Clerk Next equivalents.
 *
 * Run with: node apps/web/scripts/rewrite-imports.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  path.resolve(__dir, "../src"),
];

const REPLACEMENTS = [
  // @clerk/react → @clerk/nextjs
  [/from\s+["']@clerk\/react["']/g, 'from "@clerk/nextjs"'],
  // react-router-dom Link/useNavigate → next equivalents
  [/import\s+\{\s*Link(\s*,\s*useNavigate)?\s*\}\s+from\s+["']react-router-dom["'];?/g,
    'import Link from "next/link";\nimport { useRouter } from "next/navigation";'],
  [/import\s+\{\s*useNavigate(\s*,\s*Link)?\s*\}\s+from\s+["']react-router-dom["'];?/g,
    'import { useRouter } from "next/navigation";\nimport Link from "next/link";'],
  [/import\s+\{\s*Link\s*\}\s+from\s+["']react-router-dom["'];?/g,
    'import Link from "next/link";'],
  [/import\s+\{\s*useLocation\s*\}\s+from\s+["']react-router-dom["'];?/g,
    'import { usePathname } from "next/navigation";'],
  [/import\s+\{\s*Outlet\s*\}\s+from\s+["']react-router-dom["'];?/g, ''],
  [/import\s+\{\s*Navigate\s*\}\s+from\s+["']react-router-dom["'];?/g, ''],
  // useNavigate() → useRouter()/router.push patterns done manually but at least
  // expose the hook name swap:
  [/useNavigate\(\)/g, 'useRouter()'],
  // Link `to` prop → `href` prop (best-effort textual)
  [/<Link\s+to=/g, '<Link href='],
  // import.meta.env.VITE_* → process.env equivalent (manual override usually needed)
  [/import\.meta\.env\.VITE_API_URL/g, '""'],
  [/import\.meta\.env\.VITE_CLERK_PUBLISHABLE_KEY/g, 'process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'],
  // .ts / .tsx in local imports — drop them (Next bundler resolves without ext)
  [/from\s+["'](\.\.?\/[^"']+?)\.tsx?["']/g, 'from "$1"'],
  // ../context/ folder name → ../contexts/ (we renamed in apps/web)
  [/from\s+["']\.\.\/context\//g, 'from "../contexts/'],
  [/from\s+["']\.\.\/\.\.\/context\//g, 'from "../../contexts/'],
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

let changed = 0;
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    let src = fs.readFileSync(file, "utf8");
    const orig = src;
    for (const [pattern, replacement] of REPLACEMENTS) {
      src = src.replace(pattern, replacement);
    }
    if (src !== orig) {
      // Inject "use client" at top of pages-legacy / components / contexts / hooks
      // if the file uses React hooks but doesn't already declare it.
      const needsClient = /^(?!.*"use client")[\s\S]*?(useState|useEffect|useRef|useContext|onClick=|onChange=|useUser|useAuth|useRouter|usePathname)/m.test(src)
        && !src.startsWith('"use client"')
        && !file.endsWith("/page.tsx");
      if (needsClient && /\/(pages-legacy|components|contexts|hooks)\//.test(file)) {
        src = `"use client";\n\n${src}`;
      }
      fs.writeFileSync(file, src);
      changed++;
      console.log("✎", path.relative(process.cwd(), file));
    }
  }
}
console.log(`\nDone. ${changed} files updated.`);
