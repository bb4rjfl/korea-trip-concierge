/**
 * Kakao naming rule enforcement: server name and tool names must NOT contain
 * "kakao" (case-insensitive, anywhere). Violations fail the build (scripts/lint-naming.ts)
 * and abort server startup, so a bad name can never ship.
 */

const FORBIDDEN = /kakao/i;

/** Tool name charset rule: 1–128 chars, only A-Z a-z 0-9 _ - (case-sensitive). */
const TOOL_NAME_RE = /^[A-Za-z0-9_-]{1,128}$/;

export interface NamingViolation {
  subject: string;
  value: string;
  reason: string;
}

export function checkName(subject: string, value: string): NamingViolation[] {
  const out: NamingViolation[] = [];
  if (FORBIDDEN.test(value)) {
    out.push({ subject, value, reason: 'contains forbidden token "kakao"' });
  }
  return out;
}

export function checkToolName(value: string): NamingViolation[] {
  const out = checkName(`tool:${value}`, value);
  if (!TOOL_NAME_RE.test(value)) {
    out.push({
      subject: `tool:${value}`,
      value,
      reason: "must be 1–128 chars of [A-Za-z0-9_-] only",
    });
  }
  return out;
}

/**
 * Validate the whole surface (server name + all tool names). Throws on any
 * violation, including duplicate tool names (Kakao forbids duplicates).
 */
export function assertNamingOk(serverName: string, toolNames: string[]): void {
  const violations: NamingViolation[] = [...checkName("server", serverName)];

  const seen = new Set<string>();
  for (const name of toolNames) {
    violations.push(...checkToolName(name));
    if (seen.has(name)) {
      violations.push({ subject: `tool:${name}`, value: name, reason: "duplicate tool name" });
    }
    seen.add(name);
  }

  if (toolNames.length < 3 || toolNames.length > 20) {
    violations.push({
      subject: "tools",
      value: String(toolNames.length),
      reason: "tool count must be 3–20 (3–10 recommended)",
    });
  }

  if (violations.length > 0) {
    const msg = violations.map((v) => `  - ${v.subject} ("${v.value}"): ${v.reason}`).join("\n");
    throw new Error(`Kakao naming/structure rules violated:\n${msg}`);
  }
}
