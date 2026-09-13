/**
 * Calls to the national public-data portal (apis.data.go.kr), made the way the
 * portal can actually take them.
 *
 * The portal gives one key thirty sessions at a time. One cold bus question of
 * ours opened up to fifty — the stops around both ends, the routes at each stop,
 * the path of each route — and a burst of 120 measured 45 answers, 70 "429 too
 * many requests" and 5 replies that said HTTP 200 with a header reading "no
 * session available (30/30)". That last kind read as an empty list, the empty
 * list was cached for six hours, and a city that had answered in the morning
 * had "no bus stops" all afternoon.
 *
 * So: a handful of calls in flight at once, the portal's own error header
 * treated as the error it is, a short back-off before trying again, and a thrown
 * error — never an empty answer — when it still fails. Callers cache only what
 * succeeded.
 */

import { ExternalApiError, fetchWithTimeout } from "../http.js";

/** Well under the portal's thirty, leaving room for the live arrival feed on the same key. */
const MAX_IN_FLIGHT = 8;
const BACKOFF_MS = [400, 1200];

let inFlight = 0;
const waiting: (() => void)[] = [];

async function slot(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight++;
    return;
  }
  // The slot is handed over by release(), so the count never overshoots.
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else inFlight--;
}

/**
 * The portal's verdict on a reply, or undefined when it is a real answer.
 * "03" is the portal saying there is no data, which is an answer.
 */
export function portalError(json: unknown): string | undefined {
  const header = (json as { response?: { header?: { resultCode?: unknown; resultMsg?: unknown } } })?.response?.header;
  if (header && header.resultCode != null) {
    const code = String(header.resultCode).padStart(2, "0");
    if (code !== "00" && code !== "03") return `${code} ${String(header.resultMsg ?? "")}`.trim();
  }
  const gateway = (json as { OpenAPI_ServiceResponse?: { cmmMsgHeader?: { errMsg?: unknown; returnAuthMsg?: unknown } } })
    ?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gateway) return String(gateway.returnAuthMsg ?? gateway.errMsg ?? "SERVICE ERROR");
  return undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** JSON from the portal, or a thrown ExternalApiError — never a silent empty reply. */
export async function portalJson(url: string, timeoutMs = 6000): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    if (attempt) await sleep(BACKOFF_MS[attempt - 1]);
    await slot();
    try {
      const res = await fetchWithTimeout(url, {}, timeoutMs);
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        throw new ExternalApiError(`portal returned something other than JSON (HTTP ${res.status})`);
      }
      const why = portalError(json);
      if (why || !res.ok) throw new ExternalApiError(`portal: ${why ?? `HTTP ${res.status}`}`);
      return json;
    } catch (err) {
      last = err;
    } finally {
      release();
    }
  }
  throw last instanceof Error ? last : new ExternalApiError("portal request failed");
}
