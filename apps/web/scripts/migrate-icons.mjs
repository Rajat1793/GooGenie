#!/usr/bin/env node
/**
 * One-shot migration: replace every `<span className="material-symbols-outlined ...">{name}</span>`
 * with `<Icon name={name} className="..." />` and add the import where missing.
 *
 * Two patterns supported:
 *   1. Static literal:    <span className="material-symbols-outlined text-base">inbox</span>
 *   2. Dynamic JSX expr:  <span className="material-symbols-outlined">{cond ? "a" : "b"}</span>
 *
 * Run once: `node scripts/migrate-icons.mjs`. After this, `material-symbols-outlined`
 * should appear nowhere in src/ or app/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const FILES = execSync(
  "grep -rl material-symbols-outlined src app --include=*.tsx --include=*.ts",
  { cwd: ROOT, encoding: "utf8" }
)
  .trim()
  .split("\n")
  .filter((f) => f && !f.includes("Icon.tsx"));

let totalReplacements = 0;

for (const rel of FILES) {
  const path = `${ROOT}/${rel}`;
  let src = readFileSync(path, "utf8");
  const before = src;

  // Pattern A — static literal: <span className="material-symbols-outlined …">inbox</span>
  // Captures the rest of the className (group 1) and the icon name (group 2).
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s*>\s*([a-z][a-z0-9_]*)\s*<\/span>/g,
    (_m, classRest, iconName) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name="${iconName}"${clsAttr} />`;
    }
  );

  // Pattern B — static + inline style: <span className="material-symbols-outlined ..." style={...}>name</span>
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s+style=(\{[^}]+\})\s*>\s*([a-z][a-z0-9_]*)\s*<\/span>/g,
    (_m, classRest, style, iconName) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name="${iconName}"${clsAttr} style={${style.slice(1, -1)}} />`;
    }
  );

  // Pattern C — dynamic JSX expression: <span className="material-symbols-outlined ...">{expr}</span>
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s*>\{([^}]+)\}<\/span>/g,
    (_m, classRest, expr) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name={${expr.trim()}}${clsAttr} />`;
    }
  );

  // Pattern D — template-literal className: className={`material-symbols-outlined ${...}`}>{expr}</span>
  src = src.replace(
    /<span\s+className=\{`material-symbols-outlined([^`]*)`\}\s*>\{([^}]+)\}<\/span>/g,
    (_m, classRest, expr) => {
      const cls = classRest.trim();
      // ${...} interpolations get preserved
      const clsAttr = cls ? ` className={\`${cls}\`}` : "";
      return `<Icon name={${expr.trim()}}${clsAttr} />`;
    }
  );

  // Pattern E — template-literal className with literal name:
  src = src.replace(
    /<span\s+className=\{`material-symbols-outlined([^`]*)`\}\s*>\s*([a-z][a-z0-9_]*)\s*<\/span>/g,
    (_m, classRest, iconName) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className={\`${cls}\`}` : "";
      return `<Icon name="${iconName}"${clsAttr} />`;
    }
  );

  // Pattern F — className with style + dynamic expr:
  // <span className="material-symbols-outlined …" style={...}>{expr}</span>
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s+style=(\{[^}]+\})\s*>\{([^}]+)\}<\/span>/g,
    (_m, classRest, style, expr) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name={${expr.trim()}}${clsAttr} style={${style.slice(1, -1)}} />`;
    }
  );

  if (src !== before) {
    // Add Icon import if missing
    if (!/from\s+["'][^"']*\/components\/Icon["']/.test(src) && /<Icon\b/.test(src)) {
      // Compute relative import path
      const fromComponents = rel.startsWith("src/components/")
        ? "./Icon"
        : rel.startsWith("src/components/")
        ? "./Icon"
        : rel.startsWith("src/")
        ? "../components/Icon".replace("../", "../".repeat(rel.split("/").length - 2))
        : "../src/components/Icon".replace("../", "../".repeat(rel.split("/").length));
      // Simpler: relative from this file's dir to apps/web/src/components/Icon
      const depth = rel.split("/").length - 1;
      const baseFromAppRoot = rel.startsWith("src/")
        ? "../".repeat(depth - 1) + "components/Icon"
        : "../".repeat(depth) + "src/components/Icon";

      // Insert after the last existing import line
      const lines = src.split("\n");
      let lastImportIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*import\s/.test(lines[i])) lastImportIdx = i;
      }
      const importStmt = `import { Icon } from "${baseFromAppRoot}";`;
      if (lastImportIdx >= 0) {
        lines.splice(lastImportIdx + 1, 0, importStmt);
      } else {
        lines.unshift(importStmt);
      }
      src = lines.join("\n");
    }

    const replacements = (before.match(/material-symbols-outlined/g) || []).length;
    const remaining = (src.match(/material-symbols-outlined/g) || []).length;
    const done = replacements - remaining;
    totalReplacements += done;
    writeFileSync(path, src);
    console.log(`✓ ${rel}: ${done}/${replacements} replaced (${remaining} remaining)`);
  }
}

console.log(`\nTotal replacements: ${totalReplacements}`);
