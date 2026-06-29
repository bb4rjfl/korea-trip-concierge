/**
 * Follow-up question chips. Core UX (docs/04): every tool response ends with 2–4
 * short next-step questions the user can tap/echo to trigger the next tool call —
 * the stateless substitute for buttons. English-first with Korean alongside.
 *
 * Rendering note (2026-06-29): Kakao's AI-chat host runs an LLM that *composes*
 * the user-facing reply from our tool output (it paraphrases, and will drop a
 * block that reads like UI metadata). So the footer is framed as natural
 * "you can ask me next" follow-up QUESTIONS (not `code`-styled commands) — content
 * the composing model keeps and surfaces as suggestions. `cmdEn` should read as a
 * complete, self-contained question; keep it specific/contextual (name the place,
 * persona, etc.) so it survives composition and invites the tap.
 */

export interface Choice {
  emoji: string;
  /** The follow-up question the user taps/echoes (English). Maps to a next tool call. */
  cmdEn: string;
  /** Korean phrasing (shown alongside). */
  cmdKo?: string;
  /** Short English gloss of what it does (kept for context/tests; lightly shown). */
  descEn: string;
}

/**
 * Build the standard Markdown follow-up footer. Enforces 2–4 chips (docs/04 rule);
 * throws otherwise so a malformed footer fails fast in tests rather than shipping.
 */
export function buildChoiceFooter(choices: Choice[]): string {
  if (choices.length < 2 || choices.length > 4) {
    throw new Error(`choice footer must have 2–4 chips, got ${choices.length}`);
  }

  const lines = choices.map((c) => {
    const ko = c.cmdKo ? ` / ${c.cmdKo}` : "";
    return `- ${c.emoji} **${c.cmdEn}**${ko}`;
  });

  // Header doubles as a soft cue to the composing host LLM that these are the
  // user's next tap-to-continue options (so it surfaces rather than drops them).
  return ["---", "**💬 You can ask me next / 다음으로 물어보세요:**", ...lines].join("\n");
}
