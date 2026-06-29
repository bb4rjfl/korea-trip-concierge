/**
 * Naver & Kakao Map deep-links for a place or area.
 *
 * Google Maps lacks Korean walking/transit/POI data, so locals (and the guidance
 * we already give) use **Naver Map** and **Kakao Map**. We hand the visitor both
 * so they can tap straight to the spot or open turn-by-turn directions in an app
 * that actually works in Korea. Plain official utility links — not ads. Concrete
 * URLs survive the host LLM's paraphrasing, so they reliably reach the user.
 */

/** A one-line "open in map" link pair for a search term (place or area name). "" if empty. */
export function mapLinks(query: string): string {
  const raw = (query ?? "").trim();
  if (!raw) return "";
  const q = encodeURIComponent(raw);
  return `🗺️ Map: [Naver](https://map.naver.com/p/search/${q}) · [Kakao](https://map.kakao.com/?q=${q})`;
}
