#!/usr/bin/env node
/**
 * Pass 2: catch multi-line `<span className="material-symbols-outlined …" style={…}>NAME</span>`
 * that the first pass missed. Uses /s flag (dotAll) so newlines inside the tag don't break
 * the regex.
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

let total = 0;
for (const rel of FILES) {
  const path = `${ROOT}/${rel}`;
  let src = readFileSync(path, "utf8");
  const before = src;

  // Multi-line span: any whitespace including newlines.
  // <span className="material-symbols-outlined ..." style={...}>name</span>
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s+style=(\{[^}]+\})\s*>\s*([a-z][a-z0-9_]*)\s*<\/span>/gs,
    (_m, classRest, style, name) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name="${name}"${clsAttr} style={${style.slice(1, -1)}} />`;
    }
  );

  // Multi-line span: dynamic expression
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s+style=(\{[^}]+\})\s*>\s*\{([^}]+)\}\s*<\/span>/gs,
    (_m, classRest, style, expr) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name={${expr.trim()}}${clsAttr} style={${style.slice(1, -1)}} />`;
    }
  );

  // No-style multi-line static
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s*>\s*([a-z][a-z0-9_]*)\s*<\/span>/gs,
    (_m, classRest, name) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name="${name}"${clsAttr} />`;
    }
  );

  // No-style multi-line dynamic expression — handles nested object literals
  // by counting braces. Simpler approach: greedy match up to </span>.
  src = src.replace(
    /<span\s+className="material-symbols-outlined([^"]*)"\s*>\s*\{([\s\S]+?)\}\s*<\/span>/gs,
    (_m, classRest, expr) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className="${cls}"` : "";
      return `<Icon name={${expr.trim()}}${clsAttr} />`;
    }
  );

  // Template-literal className with multi-line content
  src = src.replace(
    /<span\s+className=\{`material-symbols-outlined([^`]*)`\}\s*>\s*\{([\s\S]+?)\}\s*<\/span>/gs,
    (_m, classRest, expr) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className={\`${cls}\`}` : "";
      return `<Icon name={${expr.trim()}}${clsAttr} />`;
    }
  );
  src = src.replace(
    /<span\s+className=\{`material-symbols-outlined([^`]*)`\}\s*>\s*([a-z][a-z0-9_]*)\s*<\/span>/gs,
    (_m, classRest, name) => {
      const cls = classRest.trim();
      const clsAttr = cls ? ` className={\`${cls}\`}` : "";
      return `<Icon name="${name}"${clsAttr} />`;
    }
  );

  if (src !== before) {
    if (!/from\s+["'][^"']*\/components\/Icon["']/.test(src) && /<Icon\b/.test(src)) {
      const depth = rel.split("/").length - 1;
      const baseFromAppRoot = rel.startsWith("src/")
        ? "../".repeat(depth - 1) + "components/Icon"
        : "../".repeat(depth) + "src/components/Icon";
      const lines = src.split("\n");
      let lastImportIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*import\s/.test(lines[i])) lastImportIdx = i;
      }
      const importStmt = `import { Icon } from "${baseFromAppRoot}";`;
      if (lastImportIdx >= 0) lines.splice(lastImportIdx + 1, 0, importStmt);
      else lines.unshift(importStmt);
      src = lines.join("\n");
    }
    const replaced = (before.match(/material-symbols-outlined/g) || []).length;
    const remaining = (src.match(/material-symbols-outlined/g) || []).length;
    total += replaced - remaining;
    writeFileSync(path, src);
    console.log(`✓ ${rel}: ${replaced - remaining}/${replaced} replaced (${remaining} remaining)`);
  }
}
console.log(`\nPass 2 total: ${total}`);
