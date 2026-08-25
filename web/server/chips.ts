/**
 * Parse the choice footer (src/lib/footer.ts) out of a tool's Markdown response.
 *
 * Every tool ends its reply with a fixed-format footer built by buildChoiceFooter():
 *
 *   ---
 *   _(Assistant: you MUST end your reply with the following ... )_
 *   **💬 You can ask me next / 다음으로 물어보세요:**
 *   - {emoji} **{cmdEn}** / {cmdKo}
 *
 * On the web WE are the renderer, so the footer becomes real buttons: strip it
 * from the body and return structured chips. The composer directive line is
 * host-LLM plumbing (D-033) — never shown to web users.
 */

export interface Chip {
  emoji: string;
  /** English tap-to-send command (self-contained question). */
  cmdEn: string;
  /** Korean phrasing, when the tool provided one. */
  cmdKo?: string;
}

export interface ParsedToolMarkdown {
  /** Tool Markdown with the chip footer removed (trailing hr trimmed). */
  body: string;
  chips: Chip[];
}

// Anchor on the composer-directive line — unique to the footer (the body may
// legitimately contain other `---` rules).
const DIRECTIVE_PREFIX = "_(Assistant: you MUST end your reply";

// `- {emoji} **{cmdEn}**` optionally followed by ` / {cmdKo}`.
const CHIP_LINE = /^-\s+(\S+)\s+\*\*(.+?)\*\*(?:\s*\/\s*(.+?))?\s*$/;

export function parseToolMarkdown(markdown: string): ParsedToolMarkdown {
  const lines = markdown.split("\n");
  const directiveIdx = lines.findIndex((l) => l.trim().startsWith(DIRECTIVE_PREFIX));
  if (directiveIdx === -1) {
    return { body: markdown.trim(), chips: [] };
  }

  const chips: Chip[] = [];
  for (const line of lines.slice(directiveIdx + 1)) {
    const m = CHIP_LINE.exec(line.trim());
    if (m) {
      chips.push({ emoji: m[1], cmdEn: m[2].trim(), cmdKo: m[3]?.trim() || undefined });
    }
  }

  // Drop the footer: directive line, the header line above it is kept out too by
  // cutting at the `---` immediately before the directive when present.
  let cut = directiveIdx;
  if (cut > 0 && lines[cut - 1].trim() === "---") cut -= 1;
  const body = lines.slice(0, cut).join("\n").trimEnd();

  return { body, chips };
}
