/**
 * Subway routes outside the capital — on our own graphs, before the metered
 * routing service, whose daily allowance ran out one night while the
 * traveller-facing routes depended on it.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import DATA from "../src/lib/data/regionalSubway.json" with { type: "json" };
import { getTransitRoute } from "../src/tools/getTransitRoute.js";
import { runRoute } from "../web/client/src/device/route.js";

afterEach(() => vi.unstubAllGlobals());

const text = async (from: string, to: string) => (await getTransitRoute.handler({ from, to })).content[0].text;

describe("the networks, as built", () => {
  const nets = DATA as unknown as Record<string, { stations: { k: string; l: string }[]; transfers: unknown[] }>;

  it("cover every line in the four cities", () => {
    expect(new Set(nets.busan.stations.map((s) => s.l))).toEqual(
      new Set(["부산 1호선", "부산 2호선", "부산 3호선", "부산 4호선", "부산김해경전철", "동해선"]),
    );
    expect(new Set(nets.daegu.stations.map((s) => s.l)).size).toBe(3);
    expect(nets.gwangju.stations.length).toBe(20);
    expect(nets.daejeon.stations.length).toBe(22);
  });

  it("know where lines meet", () => {
    expect(nets.busan.transfers.length).toBeGreaterThanOrEqual(10);
    expect(nets.daegu.transfers.length).toBe(3);
  });
});

describe("a route between named places in another city", () => {
  it("rides Busan's lines, names stations by Busan's own signs, and prices by Busan's fare", async () => {
    const t = await text("Nampo", "Songjeong Beach");
    expect(t).toMatch(/Busan Line 1/);
    expect(t).toMatch(/Busan Nat'l Univ\. of Education \(교대\)/);
    expect(t).not.toMatch(/Seoul Nat'l Univ/);
    expect(t).toMatch(/₩1,800/);
  });

  it("goes by the light rail from Gimhae Airport", async () => {
    expect(await text("Gimhae Airport", "Seomyeon")).toMatch(/Busan–Gimhae LRT[^\n]*Airport \(공항\) → Sasang/);
  });

  it("ends a hill trip at its gateway, with the bus up", async () => {
    const t = await text("Busan Station", "Gamcheon Culture Village");
    expect(t).toMatch(/→ Toseong \(토성\)/);
    expect(t).toMatch(/Saha 1-1/);
  });

  it("does not answer Gwangju's Songjeong with Busan's", async () => {
    expect(await text("Gwangju Songjeong Station", "Asia Culture Center")).toMatch(/Gwangju Songjeong Station \(광주송정\) → Asia Culture Center/);
  });

  it("plans Daejeon and Daegu too", async () => {
    expect(await text("Daejeon Station", "Yuseong Hot Springs")).toMatch(/Daejeon Line 1[^\n]*Yuseong Spa/);
    expect(await text("Dongdaegu Station", "Seomun Market")).toMatch(/Daegu Line 3/);
  });
});

describe("a route from where the traveller is standing, in Busan", () => {
  it("is planned on the phone on Busan's network", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    const card = await runRoute(
      { kind: "route", to: "Seomyeon", dest: { lat: 35.1579, lng: 129.0594 }, destStation: "서면" },
      { lat: 35.1587, lng: 129.1604 }, // Haeundae beach
      "en",
    );
    expect(card.markdown).toMatch(/Busan Line 2/);
    expect(card.markdown).toMatch(/Haeundae \(해운대\)/);
    expect(card.markdown).toMatch(/₩1,800/);
  });
});
