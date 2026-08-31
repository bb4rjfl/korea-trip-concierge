/**
 * Pre-warm outbound connections to the external data sources on boot, so the first
 * real user query doesn't pay the cold-start (DNS + TLS handshake) cost and time out
 * against the 2.5s p99 budget. Best-effort, fire-and-forget, never throws.
 *
 * Observed live (D-036): right after a redeploy the first POI/route query timed out
 * ("Couldn't reach the places service"); the next call (warm pool) was fast. Hitting
 * each origin once on boot establishes the keep-alive connection the first user reuses.
 */

// One URL per external origin. The path may 4xx — we only need the DNS + TLS handshake
// and a pooled keep-alive socket; the body is drained so the socket returns to the pool.
import { getGraph } from "./sources/subwayGraph.js";

export const WARM_URLS = [
  "https://openapi.naver.com/v1/search/local.json?query=x&display=1", // Naver POI
  "https://places-api.foursquare.com/places/search?ll=37.57,126.98",  // Foursquare POI
  "http://apis.data.go.kr/",                                          // TourAPI / TAGO / weather / air
  "https://api.odsay.com/v1/api/searchPubTransPathT",                  // ODsay routing
  "https://api-call.visitseoul.net/",                                 // VisitSeoul
  "https://api.visitjeju.net/",                                       // VisitJeju
  "http://swopenapi.seoul.go.kr/",                                    // Seoul subway
  "http://ws.bus.go.kr/api/rest",                                     // Seoul bus
];

/** Fire one throwaway request per external origin to warm the connection pool. */
import { livePool } from "./livePool.js";

/**
 * Build the course candidate pool before anyone asks for a course. It takes
 * about ten seconds across a dozen calls, cached for hours — paid once at boot
 * rather than by whoever asks first.
 */
export function warmCoursePool(): void {
  for (const city of ["Seoul", "Busan", "Jeju"]) {
    void livePool(city).catch(() => undefined);
  }
}

export function warmUpSources(): void {
  // Pull the subway graph in the background so the first route request is instant.
  void getGraph();
  for (const url of WARM_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    void fetch(url, { method: "GET", signal: controller.signal })
      .then((r) => r.arrayBuffer()) // drain → the keep-alive socket returns to the pool
      .catch(() => {}) // best-effort: a 4xx/timeout still warmed DNS+TLS
      .finally(() => clearTimeout(timer));
  }
}
