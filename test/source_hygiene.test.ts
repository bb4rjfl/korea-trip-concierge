/**
 * A guard against a bug we shipped twice: shell heredocs collapse a doubled
 * backslash, so a regex written as `\b` lands in the file as a literal backspace
 * (0x08). The regex still compiles, so nothing fails loudly — it just silently
 * stops matching, which is how `\ber\b` quietly dropped "ER" from the
 * medical-emergency router. Scanning the source is the only cheap way to see it.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "web/server", "web/client/src", "test"];
const SKIP = new Set(["node_modules", "dist", "dist-web", ".git"]);

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

describe("source hygiene", () => {
  it("has no stray control characters from mangled escapes", () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((r) => {
      try {
        return walk(r);
      } catch {
        return [];
      }
    })) {
      const text = readFileSync(file, "utf8");
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        // getNowInfo deliberately embeds a control-char class to reject junk input.
        if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
          if (text.slice(Math.max(0, i - 120), i).includes("eslint-disable-next-line no-control-regex")) continue;
          offenders.push(`${file}: 0x${code.toString(16)} near "${text.slice(Math.max(0, i - 40), i + 10)}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no double-escaped word boundaries inside regex literals", () => {
    // The same heredoc hazard in the other direction: writing the escape twice to
    // survive the shell leaves `\\b` in the file, which a regex reads as a literal
    // backslash followed by "b". `PRICEY` shipped that way and never matched
    // "mall" — a budget traveller was still being sent to department stores.
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap((r) => {
      try {
        return walk(r);
      } catch {
        return [];
      }
    })) {
      if (file.includes("source_hygiene")) continue; // this file names the pattern on purpose
      for (const line of readFileSync(file, "utf8").split("\n")) {
        // `new RegExp("\\s")` is *correct* double-escaping — the string literal
        // eats one level before the regex engine sees it. Only literals are wrong.
        if (line.includes("RegExp(")) continue;
        if (!line.includes("/") || !/\\\\[bBdDsSwW]/.test(line)) continue;
        offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
