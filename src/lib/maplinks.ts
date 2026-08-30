/**
 * Naver & Kakao Map deep-links for a place or area.
 *
 * Google Maps lacks Korean walking/transit/POI data, so locals (and the guidance
 * we already give) use **Naver Map** and **Kakao Map**. We hand the visitor both
 * so they can tap straight to the spot or open turn-by-turn directions in an app
 * that actually works in Korea. Plain official utility links — not ads. Concrete
 * URLs survive the host LLM's paraphrasing, so they reliably reach the user.
 */

/** A one-line "open in map" link pair for a search term (place or area name). "" if empty.
 *  Kakao Map is listed FIRST: the host LLM tends to keep only one link when it composes
 *  (D-033, live-observed), so we lead with Kakao (also the contest-native map). */
/**
 * Korean map services search a Korean place database, so the romanized prefix we
 * add for readability poisons the query. Verified against Kakao Map:
 *   "Seukai 99 Geurilaenpaseuta (스카이99 그릴앤파스타)" → no results
 *   "스카이99 그릴앤파스타"                              → the right place
 * When a name carries a Korean form in brackets, search on that alone.
 */
export function searchableName(name: string): string {
  const raw = (name ?? "").trim();
  const ko = /[(（]\s*([^)）]*[가-힣][^)）]*)[)）]\s*$/.exec(raw);
  if (ko) return ko[1].trim();
  // No bracketed Korean: drop a trailing "(...)" qualifier but keep the name.
  return raw.replace(/\s*[(（][^)）]*[)）]\s*$/, "").trim() || raw;
}

export function mapLinks(query: string): string {
  const raw = searchableName(query);
  if (!raw) return "";
  const q = encodeURIComponent(raw);
  return `🗺️ Map: [Kakao Map](https://map.kakao.com/?q=${q}) · [Naver Map](https://map.naver.com/p/search/${q})`;
}

/**
 * Coordinate-anchored map links. Korean map services search their **Korean**
 * place database, so an English display name ("Choansan Hydrangea Hill") finds
 * nothing. Passing the Korean name AND the exact coordinates makes the pin land
 * on the right spot regardless of how the name is written.
 * Kakao's documented link API takes `name,lat,lng`; Naver takes a search term
 * with a map centre (`c=lng,lat,zoom,...`).
 */
export function mapLinksAt(name: string, lat: number, lng: number): string {
  const raw = searchableName(name);
  if (!raw || !Number.isFinite(lat) || !Number.isFinite(lng)) return mapLinks(name);
  const n = encodeURIComponent(raw);
  // Kakao's link API drops a pin AT the coordinates and uses the name only as the
  // label, so an English label still lands on the right place. Naver has no
  // name-free pin URL, so we centre its map on the coordinates instead of running
  // a search that an English name would return nothing for.
  const kakao = `https://map.kakao.com/link/map/${n},${lat},${lng}`;
  const naver = `https://map.naver.com/p/?c=${lng},${lat},17,0,0,0,dh`;
  return `🗺️ Map: [Kakao Map](${kakao}) · [Naver Map](${naver})`;
}

/** A "get directions" link pair for a from→to trip. Kakao Map routes by place NAME
 *  (sName/eName), so this works even without coordinates — a resilient fallback when
 *  our live routing (ODsay) is unavailable, and a handy "open in map" on success. */
export function directionsLinks(from: string, to: string): string {
  const f = searchableName(from), t = searchableName(to);
  if (!f || !t) return "";
  const ef = encodeURIComponent(f), et = encodeURIComponent(t);
  return `🧭 Directions: [Kakao Map](https://map.kakao.com/?sName=${ef}&eName=${et}) · [Naver Map](https://map.naver.com/p/search/${et})`;
}
