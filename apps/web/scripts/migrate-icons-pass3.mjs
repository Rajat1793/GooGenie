#!/usr/bin/env node
/**
 * Pass 3: handle the remaining patterns where the style prop contains a
 * nested object literal (`style={{ color: ..., fontVariationSettings: ... }}`).
 * The naive regex from passes 1+2 stopped at the first `}`. Here we walk
 * the source and match braces properly.
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

/** Find the index of the matching `}` starting from `{` at openIdx. */
function findMatchingBrace(s, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Find the closing `</span>` starting from idx, with `>` of the opening tag at openTagEnd. */
function findClosingSpan(s, openTagEnd) {
  // Simple — these icon spans are leaf nodes (no nested <span>). Indexed search:
  return s.indexOf("</span>", openTagEnd);
}

function transformOnce(src) {
  const start = src.indexOf('material-symbols-outlined');
  if (start < 0) return null;

  // Walk back to find the start of the <span> tag.
  let tagStart = src.lastIndexOf("<span", start);
  if (tagStart < 0) return null;

  // Find end of opening tag — the `>` just before the icon name body.
  let i = tagStart;
  let attrs = {};
  let inAttr = null;
  let openTagEnd = -1;
  while (i < src.length) {
    if (src[i] === ">" && src[i - 1] !== "=") {
      openTagEnd = i;
      break;
    }
    i++;
  }
  if (openTagEnd < 0) return null;

  const closing = findClosingSpan(src, openTagEnd);
  if (closing < 0) return null;

  const tagSrc = src.slice(tagStart, openTagEnd + 1); // <span ...>
  const body = src.slice(openTagEnd + 1, closing);    // body between tags
  // const fullSpan = src.slice(tagStart, closing + 7);

  // Pull className=
  const classNameMatch = tagSrc.match(
    /className=(?:"([^"]*)"|\{`([^`]*)`\})/
  );
  if (!classNameMatch) return null;
  const className = (classNameMatch[1] ?? classNameMatch[2] ?? "").replace(/material-symbols-outlined/, "").trim();
  const useTemplate = !!classNameMatch[2];

  // Pull style={ ... } using balanced brace matching.
  const styleIdx = tagSrc.indexOf("style=");
  let styleExpr = null;
  if (styleIdx >= 0) {
    const openBrace = tagSrc.indexOf("{", styleIdx);
    if (openBrace >= 0) {
      const closeBrace = findMatchingBrace(tagSrc, openBrace);
      if (closeBrace >= 0) {
        styleExpr = tagSrc.slice(openBrace, closeBrace + 1); // { ... }
      }
    }
  }

  // Determine icon name — body is either `name`, `{expr}`, or whitespace+name+whitespace.
  const trimmedBody = body.trim();
  let nameAttr;
  if (/^[a-z][a-z0-9_]*$/.test(trimmedBody)) {
    nameAttr = `name="${trimmedBody}"`;
  } else if (trimmedBody.startsWith("{") && trimmedBody.endsWith("}")) {
    // Strip the outermost { } and pass through as expression.
    nameAttr = `name={${trimmedBody.slice(1, -1).trim()}}`;
  } else {
    // Treat entire body as JSX expression
    nameAttr = `name={${trimmedBody}}`;
  }

  const clsAttr = className
    ? useTemplate
      ? ` className={\`${className}\`}`
      : ` className="${className}"`
    : "";
  const styleAttr = styleExpr ? ` style=${styleExpr}` : "";
  const replacement = `<Icon ${nameAttr}${clsAttr}${styleAttr} />`;

  const before = src.slice(0, tagStart);
  const after = src.slice(closing + 7); // length of `</span>`
  return before + replacement + after;
}

let total = 0;
for (const rel of FILES) {
  const path = `${ROOT}/${rel}`;
  let src = readFileSync(path, "utf8");
  const beforeAll = src;
  let count = 0;
  // Iteratively transform until no occurrences remain or no progress.
  for (let i = 0; i < 50; i++) {
    const next = transformOnce(src);
    if (next == null) break;
    if (next === src) break;
    src = next;
    count++;
  }
  if (src !== beforeAll) {
    if (!/from\s+["'][^"']*\/components\/Icon["']/.test(src) && /<Icon\b/.test(src)) {
      const depth = rel.split("/").length - 1;
      const baseFromAppRoot = rel.startsWith("src/")
        ? "../".repeat(depth - 1) + "components/Icon"
        : "../".repeat(depth) + "src/components/Icon";
      const lines = src.split("\n");
      let lastImportIdx = -1;
      for (let k = 0; k < lines.length; k++) {
        if (/^\s*import\s/.test(lines[k])) lastImportIdx = k;
      }
      const importStmt = `import { Icon } from "${baseFromAppRoot}";`;
      if (lastImportIdx >= 0) lines.splice(lastImportIdx + 1, 0, importStmt);
      else lines.unshift(importStmt);
      src = lines.join("\n");
    }
    writeFileSync(path, src);
    total += count;
    const remaining = (src.match(/material-symbols-outlined/g) || []).length;
    console.log(`✓ ${rel}: ${count} replaced (${remaining} remaining)`);
  }
}
console.log(`\nPass 3 total: ${total}`);
