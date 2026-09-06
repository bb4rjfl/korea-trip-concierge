import { EXTERNAL_API_TIMEOUT_MS } from "./constants.js";

export class ExternalApiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExternalApiError";
  }
}

/**
 * fetch() with a hard timeout (default 2.5s) so a slow upstream can never blow
 * the p99 < 3s requirement. Aborts on timeout and raises ExternalApiError.
 */
/**
 * Hosts that have just failed us, and until when.
 *
 * apis.data.go.kr — the national public-data portal every live feed here runs
 * through — was unreachable from this server for an entire evening, refusing
 * connections until a twelve-second timeout. Every request paid that in full,
 * so an answer we could have given from our own knowledge in two seconds took
 * twelve and then apologised.
 *
 * Three consecutive failures close the circuit for a minute: the caller gets
 * its error immediately and falls back to what we hold, and one probe a minute
 * notices when the host comes back.
 */
const FAILURES_BEFORE_OPEN = 3;
const OPEN_FOR_MS = 60_000;
const breaker = new Map<string, { failures: number; openUntil: number }>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Exported so a health endpoint can say which upstreams are being skipped. */
export function trippedHosts(): string[] {
  const now = Date.now();
  return [...breaker.entries()].filter(([, v]) => v.openUntil > now).map(([h]) => h);
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = EXTERNAL_API_TIMEOUT_MS,
): Promise<Response> {
  const host = hostOf(url);
  const state = breaker.get(host);
  if (state && state.openUntil > Date.now()) {
    throw new ExternalApiError(`${host} is not responding — skipping while it recovers`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    // A reply of any status means the host is reachable; a 429 is the upstream
    // talking to us, not a dead socket.
    breaker.delete(host);
    return res;
  } catch (err) {
    const next = { failures: (state?.failures ?? 0) + 1, openUntil: 0 };
    if (next.failures >= FAILURES_BEFORE_OPEN) {
      next.openUntil = Date.now() + OPEN_FOR_MS;
      next.failures = 0;
      console.warn(`[http] ${host} unreachable — pausing calls for ${OPEN_FOR_MS / 1000}s`);
    }
    breaker.set(host, next);
    if (err instanceof Error && err.name === "AbortError") {
      throw new ExternalApiError(`upstream timed out after ${timeoutMs}ms`, err);
    }
    throw new ExternalApiError("upstream request failed", err);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch JSON with timeout + one retry. Throws ExternalApiError on failure. */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!res.ok) {
        throw new ExternalApiError(`upstream returned HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new ExternalApiError("upstream request failed");
}
