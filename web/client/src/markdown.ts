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

/**
 * DOMPurify's own list of safe link schemes, plus the two map apps' — a card
 * the phone draws opens Kakao Map or Naver Map at the traveller's own spot, and
 * those apps are reached by `kakaomap:` and `nmap:` links.
 */
const SAFE_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|kakaomap|nmap):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/**
 * Bold pairs, made explicit before the parser sees them.
 *
 * CommonMark only closes `**` when what follows is a space or punctuation, so
 * "약국은 **약국 (yakguk)**입니다" — Korean runs straight on, with no space —
 * rendered with the asterisks showing. Japanese and Chinese never put a space
 * there either. A pair on one line is bold, whatever follows it.
 */
function strongPairs(md: string): string {
  return md.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
}

export function renderMarkdown(md: string): string {
  const html = marked.parse(strongPairs(md), { async: false }) as string;
  return DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: SAFE_URI });
}
