/**
 * A question answered from where the traveller is — answered on their phone.
 *
 * Our server never receives the traveller's position, nor anything computed
 * from it: not the coordinates, not the nearest station, not the list of places
 * around them. Location used only on the device and never sent to the
 * operator's system is the case the Location Information Act leaves outside
 * location-based-service reporting (위치정보법 — 개인위치정보를 이용자의
 * 단말기에서만 활용하고 사업자의 위치정보시스템으로 전송하지 않는 경우).
 *
 * So the work is split along that line. The server understands the question —
 * which needs no position — and hands back one of these. The phone takes its
 * own GPS fix and does the part that needs one: asks Kakao directly for what is
 * around it, measures, plans the walk and the ride on its own copy of the
 * subway graph, and reads a train board every visitor gets the same copy of.
 *
 * Shared by the server (which writes these) and the web client (which runs
 * them), so it imports nothing.
 */

/** What to ask Kakao Local for: a category code (PM9 pharmacy, CS2 convenience…) or a Korean keyword. */
export interface KakaoQuery {
  category?: string;
  keyword?: string;
  /**
   * Keep only results filed under a category containing this. A keyword search
   * matches names and menus too: "종합병원" found an animal hospital and a
   * jeweller called 종합병원, and "백화점" the restaurants inside one.
   */
  categoryHas?: string;
}

/** The thing a "near me" list is of — each has its heading on the device, in four languages. */
export type NearbyNeed =
  | "pharmacy"
  | "atm"
  | "currencyExchange"
  | "convenience"
  | "touristInfo"
  | "foreignCardDining"
  | "emergency"
  | "luggage"
  | "laundry"
  | "vegan"
  | "prayer"
  | "post"
  | "food"
  | "cafe"
  | "shopping"
  | "stay"
  | "toilet";

/** Shops and services around the traveller, from Kakao's own directory. */
export interface NearbyTask {
  kind: "nearby";
  need: NearbyNeed;
  /** Run together and merged: a category search and a keyword search each find what the other misses. */
  queries: KakaoQuery[];
  /** How far this need reaches, in metres: a pharmacy is a walk, an emergency room is a taxi. */
  radius: number;
  /** Nearest first for an essential; Kakao's own relevance for somewhere to eat. */
  order: "distance" | "popular";
  /** Only a 약국 sells medicine — Olive Young is filed under pharmacy too, and is not one. */
  pharmacyOnly?: boolean;
  /** For a utility, the cafés and restaurants a keyword search drags in are noise. */
  noFood?: boolean;
  /** The Korean word to search a map app for, when the directory cannot be reached. */
  searchKo: string;
  /** Curated advice, already in the reader's language. The same whoever asks, from wherever. */
  tip?: string;
}

/** Tourist sights around the traveller, from the Korea Tourism Organization's own listings. */
export interface SightsTask {
  kind: "sights";
  /** Hospitals are listed alongside parks; only someone who asked for one wants one. */
  medical?: boolean;
  tip?: string;
}

/** A route that starts where the traveller is standing. */
export interface RouteTask {
  kind: "route";
  /** The destination, as the traveller will read it. */
  to: string;
  /** Where it is. The destination is not the traveller's position, so the server may know it. */
  dest?: { lat: number; lng: number };
  /** The station a landmark is reached by (Korean), when the destination is one we know. */
  destStation?: string;
  /** "Exit 5 — the palace gate is straight ahead", already in the reader's language. */
  exit?: string;
  /** Anything that must lead the card — the ambulance number, when the question was an emergency. */
  tip?: string;
}

/** The next trains at the station nearest the traveller. */
export interface TrainsTask {
  kind: "trains";
  /**
   * A particular station (Korean) — set only by the phone, for its own buttons
   * ("next trains at the other station nearby"). The server never names one:
   * it does not know which stations are near.
   */
  station?: string;
  tip?: string;
}

/**
 * One sight from the phone's own list, in detail — set only by the phone, for
 * its "tell me about this one" button. Fetching it by id tells the server which
 * place the traveller chose to read about, exactly as typing its name would;
 * where they are stays here.
 */
export interface SightTask {
  kind: "sight";
  id: string;
  type: number;
  title: string;
  lat: number;
  lng: number;
  tip?: string;
}

export type DeviceTask = NearbyTask | SightsTask | RouteTask | TrainsTask | SightTask;

/**
 * What the server's copy of the conversation says in place of a card the phone
 * drew. The card itself — the pharmacies round the corner, the station three
 * minutes away — would tell the server where the traveller is, so it stays on
 * the phone, and the model reads only that something was shown.
 */
export function shownOnDevice(task: DeviceTask): string {
  const what =
    task.kind === "nearby"
      ? `nearby ${task.need} places`
      : task.kind === "sights"
        ? "nearby sights"
        : task.kind === "route"
          ? `a route to ${task.to} from where they are`
          : task.kind === "sight"
            ? `details of ${task.title}, which they asked about`
            : "the next trains at their nearest station";
  return `(Shown on the traveller's phone: ${what}. Worked out on the device — their location and the list stay there.)`;
}
