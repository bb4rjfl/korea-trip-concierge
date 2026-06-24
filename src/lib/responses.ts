import { buildChoiceFooter, type Choice } from "./footer.js";
import { renderMarkdown, textResult } from "./markdown.js";
import type { ToolResult } from "../tools/types.js";

/** Standard success response: body + choice chips, 24k-guarded. */
export function ok(body: string, choices: Choice[]): ToolResult {
  return textResult(renderMarkdown(body, buildChoiceFooter(choices)));
}

/** User-friendly error response with a retry-oriented footer. */
export function fail(title: string, detail: string, choices: Choice[]): ToolResult {
  const body = `⚠️ **${title}**\n\n${detail}`;
  return textResult(renderMarkdown(body, buildChoiceFooter(choices)));
}

/**
 * Shown when a tool needs an external API key that isn't configured yet. Keeps
 * the tool listable/testable in Inspector without shipping fake data.
 */
export function notConnected(toolTitle: string, sourceNote: string, choices: Choice[]): ToolResult {
  const body =
    `🔌 **${toolTitle} — live data source not connected yet**\n\n` +
    `${sourceNote}\n\n` +
    `_This tool is wired and validated; it returns live results once the API key is configured._`;
  return textResult(renderMarkdown(body, buildChoiceFooter(choices)));
}
