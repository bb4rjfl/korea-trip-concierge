/**
 * Minimal .env loader (no dependency). Import this FIRST in server.ts so keys
 * from a local .env populate process.env before anything reads them. In prod
 * (KC) env vars are injected by the platform and no .env file exists — this
 * silently no-ops. Never overrides an already-set env var.
 */
import { existsSync, readFileSync } from "node:fs";

const ENV_PATH = ".env";

if (existsSync(ENV_PATH)) {
  for (const rawLine of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
