/**
 * "Tap to continue" choice chips. Core UX (docs/04): every tool response ends
 * with 2–4 short chips the user can echo to trigger the next tool call — the
 * stateless substitute for buttons. English-first with Korean alongside.
 */

export interface Choice {
  emoji: string;
  /** Command phrase the user echoes (English). Maps directly to a next tool call. */
  cmdEn: string;
  /** Korean command phrase (shown alongside). */
  cmdKo?: string;
  /** Short English description of what the chip does. */
  descEn: string;
}

/**
 * Build the standard Markdown footer. Enforces 2–4 chips (docs/04 rule); throws
 * otherwise so a malformed footer fails fast in tests rather than shipping.
 */
export function buildChoiceFooter(choices: Choice[]): string {
  if (choices.length < 2 || choices.length > 4) {
    throw new Error(`choice footer must have 2–4 chips, got ${choices.length}`);
  }

  const lines = choices.map((c) => {
    const ko = c.cmdKo ? ` / \`${c.cmdKo}\`` : "";
    return `- ${c.emoji} \`${c.cmdEn}\`${ko} — ${c.descEn}`;
  });

  return ["---", "**Tap to continue / 누르듯 골라주세요**", ...lines].join("\n");
}
