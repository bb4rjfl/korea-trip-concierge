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
export function mapLinks(query: string): string {
  const raw = (query ?? "").trim();
  if (!raw) return "";
  const q = encodeURIComponent(raw);
  return `🗺️ Map: [Kakao Map](https://map.kakao.com/?q=${q}) · [Naver Map](https://map.naver.com/p/search/${q})`;
}
