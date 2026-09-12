import { describe, it, expect } from "vitest";
import { itemsOf, ridesBetween, doorToDoor } from "../src/lib/sources/busNational.js";
import { resolvePlaceCoord } from "../src/lib/places.js";
import { accessFor } from "../src/lib/access.js";

/** A route's stop list as the national feed returns it: one numbered run. */
const path = (names: string[], dir?: number) =>
  names.map((nodeid, i) => ({ nodeid, nodenm: nodeid, nodeord: i + 1, ...(dir === undefined ? {} : { updowncd: dir }) }));

describe("the national bus feed", () => {
  it("reads items whether the feed sends none, one or many", () => {
    expect(itemsOf({ response: { body: { items: "" } } })).toEqual([]);
    expect(itemsOf({ response: { body: { items: { item: { a: 1 } } } } })).toEqual([{ a: 1 }]);
    expect(itemsOf({ response: { body: { items: { item: [{ a: 1 }, { a: 2 }] } } } })).toHaveLength(2);
    expect(itemsOf(undefined)).toEqual([]);
  });

  it("counts the stops between two points of one route", () => {
    expect(ridesBetween(path(["a", "b", "c", "d"]), "a", "d")).toBe(3);
  });

  it("refuses a ride that runs the wrong way", () => {
    expect(ridesBetween(path(["a", "b", "c"]), "c", "a")).toBeUndefined();
  });

  it("says nothing when a stop is not on the route", () => {
    expect(ridesBetween(path(["a", "b"]), "a", "z")).toBeUndefined();
  });

  /**
   * Suwon's 35 calls at the station forecourt 20th on the way out and 113th on
   * the way back. Taking the first appearance made the ride to Hwaseong
   * Haenggung 99 stops long, and the answer was dropped as absurd.
   */
  it("takes the shortest way round when a stop is called at twice", () => {
    expect(ridesBetween(path(["depot", "palace", "x", "station", "y", "station2", "palace2"]), "station", "palace")).toBeUndefined();
    const outAndBack = path(["palace", "x", "station", "y", "turn", "y2", "station", "x2", "palace"]);
    expect(ridesBetween(outAndBack, "station", "palace")).toBe(2);
  });

  it("keeps the two directions apart when the feed marks them", () => {
    const both = [...path(["a", "b", "c"], 0), ...path(["c", "b", "a"], 1)];
    expect(ridesBetween(both, "a", "c")).toBe(2);
    expect(ridesBetween(both, "c", "a")).toBe(2);
  });

  it("counts the walk as part of the trip, not as free", () => {
    const short = { routeName: "2", boardAt: "", alightAt: "", stops: 2, minutes: 4, walkToStopM: 218, walkFromStopM: 1135 };
    const nearer = { routeName: "2", boardAt: "", alightAt: "", stops: 3, minutes: 7, walkToStopM: 218, walkFromStopM: 791 };
    // Two stops nearer the sea is not a better trip when it lands you further away.
    expect(doorToDoor(nearer)).toBeLessThan(doorToDoor(short));
  });
});

describe("where a trip outside Seoul starts", () => {
  /**
   * "수원역" used to be read as "수원" and land on Hwaseong Haenggung — the
   * destination of the very trip being planned, which came back as a one-stop
   * bus ride that does not exist.
   */
  it("puts Suwon Station at the station, not at the palace", () => {
    const s = resolvePlaceCoord("Suwon Station")!;
    expect(s).toBeDefined();
    expect(s.lat).toBeCloseTo(37.2658, 2);
    expect(s.lng).toBeCloseTo(127.0001, 2);
    expect(resolvePlaceCoord("수원역")!.lat).toBeCloseTo(37.2658, 2);
  });

  it("does not put Jeonju Station and the hanok village in the same place", () => {
    const station = resolvePlaceCoord("전주역")!;
    const village = resolvePlaceCoord("전주한옥마을")!;
    expect(station.lat).not.toBeCloseTo(village.lat, 3);
  });

  it("still reads a bare city name as the city", () => {
    expect(resolvePlaceCoord("Suwon")!.label).toMatch(/Hwaseong|Suwon \(/);
    expect(resolvePlaceCoord("경주")!.label).toBe("Gyeongju");
  });

  it("knows the stations the intercity trains actually stop at", () => {
    for (const [name, lat] of [
      ["강릉역", 37.7645],
      ["안동역", 36.5745],
      ["여수엑스포역", 34.7531],
      ["광주송정역", 35.1377],
    ] as const) {
      expect(resolvePlaceCoord(name)!.lat).toBeCloseTo(lat, 2);
    }
  });
});

describe("east of the mountains, where the bus feed is empty", () => {
  it("answers Jeongdongjin with the train, and says the times are few", () => {
    const a = accessFor("Jeongdongjin")!;
    expect(a.note).toMatch(/train/i);
    expect(a.note).toMatch(/Gangneung/);
    expect(a.note).toMatch(/Korail/);
  });

  it("answers Seoraksan with the bus from Sokcho, and calls it a climb", () => {
    const a = accessFor("설악산")!;
    expect(a.climb).toBe(true);
    expect(a.note).toMatch(/Sokcho/);
  });

  it("answers Nami Island with the ferry", () => {
    expect(accessFor("Nami Island")!.note).toMatch(/ferry/i);
  });
});
