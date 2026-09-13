/**
 * Kakao Local keyword search, as a geocoder of last resort before giving up on a
 * place name.
 *
 * The tourism database holds attractions, and its top hit for "Suwon Station"
 * was an ARTBOX shop in the station; local search holds every shop, lane and
 * bus terminal in the country, under the names Koreans use for them. That is
 * the name that goes back into choosing a bus stop — 황리단길, not
 * "Hwangnidan-gil".
 *
 * Server-only REST key (never in the client bundle). Place names only — the
 * traveller's position is never sent (D-057).
 */

import { ENV, hasKey } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";

export interface KakaoPlace {
  name: string;
  lat: number;
  lng: number;
  address: string;
  category: string;
}

interface KakaoDoc {
  place_name?: string;
  x?: string;
  y?: string;
  road_address_name?: string;
  address_name?: string;
  category_name?: string;
}

// null = "Kakao has nothing by that name", which is worth remembering; a failed
// call is not, and is never stored.
const cache = new TtlCache<KakaoPlace | null>(24 * 60 * 60_000);

export async function kakaoKeyword(query: string): Promise<KakaoPlace | undefined> {
  const q = (query ?? "").trim();
  if (!q || !hasKey("KAKAO_REST_API_KEY")) return undefined;
  const hit = cache.get(q);
  if (hit !== undefined) return hit ?? undefined;
  try {
    const json = await fetchJson<{ documents?: KakaoDoc[] }>(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`,
      { headers: { Authorization: `KakaoAK ${ENV.KAKAO_REST_API_KEY}` } },
      3000,
    );
    const d = json.documents?.find((x) => Number.isFinite(Number(x.x)) && Number.isFinite(Number(x.y)));
    const place: KakaoPlace | null = d
      ? {
          name: d.place_name ?? q,
          lat: Number(d.y),
          lng: Number(d.x),
          address: d.road_address_name || d.address_name || "",
          category: d.category_name ?? "",
        }
      : null;
    cache.set(q, place);
    return place ?? undefined;
  } catch {
    return undefined;
  }
}
