/**
 * Kakao Local, asked directly from the phone.
 *
 * The Kakao Maps JavaScript SDK searches Kakao's own directory from the
 * browser, with a key Kakao honours only from our registered domain. The
 * traveller's position goes from their phone to Kakao, a registered location
 * service, and nowhere else — which is the point: our server is not in this
 * conversation at all.
 */

import type { KakaoQuery } from "../../../../src/lib/deviceTask.js";

/** One place as Kakao Local returns it — the fields we use. */
export interface KakaoPlace {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  /** Longitude, as a string. */
  x: string;
  /** Latitude, as a string. */
  y: string;
  place_url: string;
  /** Metres from the search point, as a string — present when a location was given. */
  distance: string;
}

interface Places {
  keywordSearch(q: string, cb: (data: KakaoPlace[], status: string) => void, opts: object): void;
  categorySearch(code: string, cb: (data: KakaoPlace[], status: string) => void, opts: object): void;
}

interface KakaoGlobal {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => object;
    services: {
      Places: new () => Places;
      Status: { OK: string; ZERO_RESULT: string };
      SortBy: { DISTANCE: string; ACCURACY: string };
    };
  };
}

declare global {
  interface Window {
    kakao?: KakaoGlobal;
  }
}

let ready: Promise<KakaoGlobal | undefined> | undefined;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("kakao sdk"));
    document.head.appendChild(s);
  });
}

/** The SDK, loaded the first time it is needed, or nothing if it cannot be. */
export function kakaoSdk(): Promise<KakaoGlobal | undefined> {
  ready ??= (async () => {
    const cfg = (await fetch("/api/client-config").then((r) => r.json())) as { kakaoJsKey?: string };
    const key = (cfg.kakaoJsKey ?? "").trim();
    if (!key) return undefined;
    await loadScript(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`);
    const k = window.kakao;
    if (!k) return undefined;
    await new Promise<void>((resolve) => k.maps.load(resolve));
    return k;
  })().catch(() => {
    // Let the next question try again rather than remembering one bad network moment.
    ready = undefined;
    return undefined;
  });
  return ready;
}

/**
 * One search around a point: a category, a keyword, or a keyword within a
 * category. Resolves to [] on anything but success, and never waits more than
 * a few seconds — the card has somewhere else to send them if Kakao is slow.
 */
export function searchAround(
  k: KakaoGlobal,
  q: KakaoQuery,
  at: { lat: number; lng: number },
  radius: number,
  order: "distance" | "popular",
): Promise<KakaoPlace[]> {
  const places = new k.maps.services.Places();
  const opts = {
    location: new k.maps.LatLng(at.lat, at.lng),
    radius: Math.min(20_000, Math.max(50, Math.round(radius))),
    sort: order === "distance" ? k.maps.services.SortBy.DISTANCE : k.maps.services.SortBy.ACCURACY,
    size: 15,
  };
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), 5000);
    const done = (data: KakaoPlace[], status: string): void => {
      clearTimeout(timer);
      const rows = status === k.maps.services.Status.OK ? data : [];
      resolve(q.categoryHas ? rows.filter((p) => p.category_name.includes(q.categoryHas!)) : rows);
    };
    try {
      if (q.keyword) places.keywordSearch(q.keyword, done, q.category ? { ...opts, category_group_code: q.category } : opts);
      else if (q.category) places.categorySearch(q.category, done, opts);
      else done([], "");
    } catch {
      done([], "");
    }
  });
}
