/**
 * HTML utilities shared across routes and integrations.
 *
 * Previously `stripHtml` was duplicated in `routes/ai.ts` (comprehensive,
 * decoded entities) and `integrations/gmail.ts` (minimal, no entity decoding).
 * This module consolidates them — callers should import from here.
 */

/**
 * Convert an HTML string to plain text:
 *  • Strips <style> and <script> blocks (incl. content)
 *  • Removes all remaining tags
 *  • Decodes the most common HTML entities (&nbsp; &amp; &lt; &gt; &quot;)
 *  • Collapses whitespace
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}
