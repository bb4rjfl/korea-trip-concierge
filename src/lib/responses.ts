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
 * Shown when a tool's live data source is temporarily unavailable (e.g. its key
 * isn't configured in this environment). Neutral wording that reads fine both in
 * local/Inspector and in production — never ships fake data (S2).
 */
export function notConnected(toolTitle: string, sourceNote: string, choices: Choice[]): ToolResult {
  const body =
    `🔌 **${toolTitle} — live data temporarily unavailable**\n\n` +
    `${sourceNote}\n\n` +
    `_This usually clears up shortly. Please try again in a moment._`;
  return textResult(renderMarkdown(body, buildChoiceFooter(choices)));
}

/**
 * Standard "upstream didn't respond in time" failure — shared so every tool's
 * timeout/network path reads consistently (S3).
 */
export function timeoutFail(serviceLabel: string, choices: Choice[]): ToolResult {
  return fail(
    `Couldn't reach the ${serviceLabel} service`,
    "It didn't respond in time. Please try again in a moment.",
    choices,
  );
}
