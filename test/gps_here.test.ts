/**
 * Answering from the traveller's exact position — the way a map app does.
 *
 * Tested on a phone 690 m from Yangjae Station, the answer was about Yangjae
 * Station: the position had been reduced to the nearest station's name, and
 * everything ran from there — including a button offering to take them to
 * Yangjae. The phone now sends its GPS fix with the question, and the tools
 * work from it: what is nearest to *them*, measured from *them*, and a route
 * that begins with the walk.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { parseHere, withHere, getHere, isHere, metresFromHere, distanceLabel, HERE_AREA } from "../src/lib/hereContext.js";
import { nearestStation, nearestLandmark } from "../src/lib/nearest.js";
import { handleChat } from "../web/server/orchestrator.js";

/** The spot from the screenshot: ~690 m from Yangjae Station. */
const NEAR_YANGJAE = { lat: 37.479, lng: 127.0405, accuracy: 15 };

describe("a position from a request", () => {
  it("is accepted inside Korea, rounded to about ten metres", () => {
    expect(parseHere({ lat: 37.47901234, lng: 127.04051234, accuracy: 14.6 })).toEqual({
      lat: 37.479,
      lng: 127.0405,
      accuracy: 15,
    });
  });

  it("is refused outside Korea, or when it is not a position at all", () => {
    expect(parseHere({ lat: 51.5, lng: -0.12 })).toBeUndefined(); // London
    expect(parseHere({ lat: "north", lng: 127 })).toBeUndefined();
    expect(parseHere(undefined)).toBeUndefined();
    expect(parseHere("37.5,127")).toBeUndefined();
  });

  it("drops a nonsense accuracy rather than the whole fix", () => {
    expect(parseHere({ lat: 37.5, lng: 127, accuracy: -3 })).toEqual({ lat: 37.5, lng: 127 });
  });
});

describe("the position, for the length of one request", () => {
  it("is there inside it and gone after", async () => {
    await withHere(NEAR_YANGJAE, async () => {
      expect(getHere()).toEqual(NEAR_YANGJAE);
      expect(isHere(HERE_AREA)).toBe(true);
      expect(isHere("Myeongdong")).toBe(false);
    });
    expect(getHere()).toBeUndefined();
    // Without a position, the words alone mean nothing.
    expect(isHere(HERE_AREA)).toBe(false);
  });

  it("measures from the traveller", async () => {
    await withHere(NEAR_YANGJAE, async () => {
      const yangjae = nearestStation(NEAR_YANGJAE.lat, NEAR_YANGJAE.lng)!;
      expect(yangjae.station.k).toBe("양재");
      const m = metresFromHere(yangjae.station.lat, yangjae.station.lng)!;
      expect(m).toBeGreaterThan(500);
      expect(m).toBeLessThan(1000);
    });
  });

  it("says distances the way a map app does", () => {
    expect(distanceLabel(140)).toBe("140 m");
    expect(distanceLabel(1240)).toBe("1.2 km");
  });

  it("does not offer a station as a neighbourhood to write a guide about", () => {
    expect(nearestLandmark(NEAR_YANGJAE.lat, NEAR_YANGJAE.lng)?.label).not.toMatch(/station$/i);
  });
});

describe("the orchestrator, told where the traveller is", () => {
  beforeAll(() => {
    // Deterministic: the rule router, no composing layer, no translation.
    delete process.env.GEMINI_API_KEY;
  });

  it("does not ask where they are", async () => {
    const res = await handleChat({
      messages: [{ role: "user", content: "where is the nearest pharmacy" }],
      uiLang: "en",
      here: NEAR_YANGJAE,
    });
    const text = res.toolMarkdown ?? res.reply ?? "";
    expect(text).not.toMatch(/Where are you right now|Which area/i);
    expect(res.meta.tool).toBe("findForeignerFriendlyStore");
    // Around them, not around a named place.
    expect(text).toMatch(/Pharmacy near you/);
  });

  it("still asks when it was not told", async () => {
    const res = await handleChat({ messages: [{ role: "user", content: "where is the nearest pharmacy" }], uiLang: "en" });
    expect(res.reply ?? "").toMatch(/Where are you right now/);
  });

  it("answers a place the traveller named about that place, not about them", async () => {
    const res = await handleChat({
      messages: [{ role: "user", content: "is there a pharmacy near Myeongdong" }],
      uiLang: "en",
      here: NEAR_YANGJAE,
    });
    expect(res.toolMarkdown ?? "").not.toMatch(/near you/);
  });
});

describe("a route from where the traveller is standing", () => {
  it("says to walk when the destination is a short walk away", async () => {
    const { executeTool } = await import("../web/server/catalog.js");
    const r = await withHere(NEAR_YANGJAE, () => executeTool("getTransitRoute", { from: HERE_AREA, to: "Yangjae Station" }));
    const text = (r as { markdown?: string }).markdown ?? "";
    expect(text).toMatch(/Walk to Yangjae Station/);
    expect(text).toMatch(/8\d0 m/);
    // Never "you're already there" to someone most of a kilometre away.
    expect(text).not.toMatch(/already at/i);
  });
});

describe("the station named in a route question is where they are going", () => {
  it("is not also used as where they are coming from", async () => {
    const { backfillArgs, deriveContext } = await import("../web/server/context.js");
    const ctx = deriveContext([{ role: "user", content: "how do I get to Yangjae Station" }]);
    const args = backfillArgs("getTransitRoute", { to: "Yangjae Station" }, ctx);
    expect(args.from).toBeUndefined();
  });
});
