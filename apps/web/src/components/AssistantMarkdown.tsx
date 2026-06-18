"use client";

/**
 * Lightweight markdown renderer scoped to the GooGenie assistant chat.
 *
 * We deliberately avoid pulling in `react-markdown` / `remark` (~80 KB gzipped
 * for what we need) and instead support the small subset the agent actually
 * emits:
 *   - ATX headings (`#`, `##`, `###`)
 *   - unordered lists (`-`, `*`, `•`)
 *   - ordered lists (`1.`)
 *   - bold (`**text**`), italic (`*text*` / `_text_`)
 *   - inline code (``code``)
 *   - fenced code blocks (```lang … ```)
 *   - blockquotes (`> text`)
 *   - autolinks ([text](url))
 *   - paragraphs / line breaks
 *
 * Output is plain React nodes — no `dangerouslySetInnerHTML`, so it's XSS
 * safe by construction. Styling lives in `apps/web/src/styles/index.css`
 * under `.googenie-prose`.
 */
import type { ReactNode } from "react";

/** Render inline markup (bold/italic/code/links) inside a single text run. */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: match bold first (** **) so the single-`*` italic regex
  // doesn't eat the inner `*` of a bold span.
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(text.slice(last, idx));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**") && tok.endsWith("**")) {
      nodes.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      nodes.push(<code key={k}>{tok.slice(1, -1)}</code>);
    } else if (tok.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      if (link) {
        nodes.push(
          <a key={k} href={link[2]} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(tok);
      }
    } else if ((tok.startsWith("*") && tok.endsWith("*")) || (tok.startsWith("_") && tok.endsWith("_"))) {
      nodes.push(<em key={k}>{tok.slice(1, -1)}</em>);
    } else {
      nodes.push(tok);
    }
    last = idx + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface ListBlock {
  type: "ul" | "ol";
  items: string[];
}
type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: 1 | 2 | 3; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; lang: string | null; text: string }
  | { type: "quote"; text: string }
  | { type: "hr" };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  let list: ListBlock | null = null;
  let codeBuf: string[] | null = null;
  let codeLang: string | null = null;
  let quoteBuf: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push({ type: list.type, items: list.items });
      list = null;
    }
  };
  const flushQuote = () => {
    if (quoteBuf.length) {
      out.push({ type: "quote", text: quoteBuf.join(" ") });
      quoteBuf = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    // Fenced code block toggle
    const fence = /^```(\w*)\s*$/.exec(raw.trim());
    if (fence) {
      if (codeBuf) {
        out.push({ type: "code", lang: codeLang, text: codeBuf.join("\n") });
        codeBuf = null;
        codeLang = null;
      } else {
        flushAll();
        codeBuf = [];
        codeLang = fence[1] || null;
      }
      continue;
    }
    if (codeBuf) {
      codeBuf.push(raw);
      continue;
    }

    const line = raw.trim();
    if (!line) {
      flushAll();
      continue;
    }

    // Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      flushAll();
      out.push({ type: "hr" });
      continue;
    }

    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      flushAll();
      out.push({ type: "h", level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }

    // Blockquote
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flushPara();
      flushList();
      quoteBuf.push(q[1]);
      continue;
    } else {
      flushQuote();
    }

    // Unordered list — supports -, *, • and en/em dashes
    const ul = /^[-*•–—]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      if (list && list.type !== "ul") flushList();
      list ??= { type: "ul", items: [] };
      list.items.push(ul[1]);
      continue;
    }
    // Ordered list
    const ol = /^(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      if (list && list.type !== "ol") flushList();
      list ??= { type: "ol", items: [] };
      list.items.push(ol[2]);
      continue;
    }
    flushList();

    para.push(line);
  }
  if (codeBuf) out.push({ type: "code", lang: codeLang, text: codeBuf.join("\n") });
  flushAll();
  return out;
}

export interface AssistantMarkdownProps {
  text: string;
  className?: string;
}

export function AssistantMarkdown({ text, className }: AssistantMarkdownProps) {
  const blocks = parseBlocks(text);
  return (
    <div className={`googenie-prose ${className ?? ""}`.trim()}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h":
            if (b.level === 1) return <h1 key={i}>{renderInline(b.text, `h1-${i}`)}</h1>;
            if (b.level === 2) return <h2 key={i}>{renderInline(b.text, `h2-${i}`)}</h2>;
            return <h3 key={i}>{renderInline(b.text, `h3-${i}`)}</h3>;
          case "p":
            return <p key={i}>{renderInline(b.text, `p-${i}`)}</p>;
          case "ul":
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `ul-${i}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it, `ol-${i}-${j}`)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre key={i} aria-label={b.lang ? `code (${b.lang})` : "code"}>
                <code>{b.text}</code>
              </pre>
            );
          case "quote":
            return <blockquote key={i}>{renderInline(b.text, `q-${i}`)}</blockquote>;
          case "hr":
            return <hr key={i} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
