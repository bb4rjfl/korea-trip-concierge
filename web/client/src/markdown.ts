import { marked } from "marked";
import DOMPurify from "dompurify";

/**
 * Tool responses are Markdown we authored server-side, but they interpolate
 * external API strings (place titles etc.) — so the HTML is always sanitized.
 */

marked.setOptions({ gfm: true, breaks: true });

// External links open in a new tab, safely.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
