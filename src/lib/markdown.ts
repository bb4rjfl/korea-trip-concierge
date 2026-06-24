import { MAX_RESPONSE_CHARS, RESPONSE_BUDGET_CHARS } from "./constants.js";

/**
 * Assemble a final Markdown response from a body and an optional footer (choice
 * chips). Guarantees the total never exceeds the Kakao 24k ceiling: if the body
 * is too long, it is truncated first so the footer chips always survive.
 */
export function renderMarkdown(body: string, footer?: string): string {
  const foot = footer ? `\n\n${footer.trim()}` : "";
  const budget = RESPONSE_BUDGET_CHARS - foot.length;

  let trimmedBody = body.trim();
  if (trimmedBody.length > budget) {
    const cut = Math.max(0, budget - 40);
    trimmedBody = trimmedBody.slice(0, cut).trimEnd() + "\n\n_…(truncated for length)_";
  }

  let out = `${trimmedBody}${foot}`;
  // Absolute hard guard — should never trigger given the budget above.
  if (out.length > MAX_RESPONSE_CHARS) {
    out = out.slice(0, MAX_RESPONSE_CHARS - 1);
  }
  return out;
}

/** Wrap a Markdown string as an MCP text-content tool result. */
export function textResult(markdown: string) {
  return { content: [{ type: "text" as const, text: markdown }] };
}
