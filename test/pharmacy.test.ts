/**
 * "Is there a pharmacy open near me?" — the question at 11pm with a fever.
 *
 * Production answered it with "no 24-hour pharmacy is listed" and general
 * advice: true, and no help. The National Medical Center publishes every
 * pharmacy's hours; these tests hold how we read them.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { openState, koreaNow } from "../src/lib/pharmacyHours.js";
import { parseItems, weekOf } from "../src/lib/sources/pharmacyIndex.js";
import { pickPharmacies, runPharmacies } from "../web/client/src/device/pharmacies.js";

afterEach(() => vi.unstubAllGlobals());

const WEEKDAYS_9_TO_7 = ["0900-1900", "0900-1900", "0900-1900", "0900-1900", "0900-1900", "0900-1500", "", ""].join("|");
const LATE_TO_1AM = ["0900-2500", "0900-2500", "0900-2500", "0900-2500", "0900-2500", "0900-2500", "0900-2500", "0900-2500"].join("|");
const ALL_DAY = Array(8).fill("0000-2400").join("|");
const MON = 0;
const SAT = 5;
const SUN = 6;
const at = (h: number, m = 0) => h * 60 + m;

describe("open now, or when", () => {
  it("is open inside the day's hours and says until when", () => {
    expect(openState(WEEKDAYS_9_TO_7, MON, at(14))).toEqual({ open: true, until: "19:00" });
  });

  it("before opening, says when it opens today", () => {
    expect(openState(WEEKDAYS_9_TO_7, MON, at(8, 15))).toEqual({ open: false, opens: "09:00" });
  });

  it("after closing on Saturday, looks ahead past a closed Sunday to Monday", () => {
    expect(openState(WEEKDAYS_9_TO_7, SAT, at(16))).toEqual({ open: false, opens: "09:00", opensLater: true });
    expect(openState(WEEKDAYS_9_TO_7, SUN, at(12))).toEqual({ open: false, opens: "09:00", opensLater: true });
  });

  it("keeps a pharmacy open past midnight on the previous day's hours", () => {
    // Tuesday 00:30, on Monday's 09:00–25:00.
    expect(openState(LATE_TO_1AM, 1, at(0, 30))).toEqual({ open: true, until: "01:00" });
    expect(openState(LATE_TO_1AM, 1, at(1, 30)).open).toBe(false);
  });

  it("reads the holiday hours on a public holiday", () => {
    // A weekday that is a holiday: this pharmacy keeps no holiday hours.
    expect(openState(WEEKDAYS_9_TO_7, MON, at(14), true).open).toBe(false);
    expect(openState(LATE_TO_1AM, MON, at(14), true).open).toBe(true);
  });

  it("says 24 hours when it is", () => {
    expect(openState(ALL_DAY, MON, at(3))).toMatchObject({ open: true, allDay: true });
  });

  it("knows the weekday and minute in Korea, whatever the phone's clock zone", () => {
    const k = koreaNow(Date.UTC(2026, 8, 11, 14, 30)); // Friday 23:30 KST
    expect(k.day).toBe(4);
    expect(k.minute).toBe(at(23, 30));
    expect(k.ymd).toBe("20260911");
  });
});

describe("the National Medical Center listing", () => {
  const xml = `<response><header><resultCode>00</resultCode></header><body><items>
    <item><dutyName>푸른온누리약국</dutyName><dutyTel1>02-575-0000</dutyTel1><wgs84Lat>37.4795</wgs84Lat><wgs84Lon>127.0412</wgs84Lon>
      <dutyTime1s>0900</dutyTime1s><dutyTime1c>2200</dutyTime1c><dutyTime6s>0900</dutyTime6s><dutyTime6c>1800</dutyTime6c><dutyTime8s>1000</dutyTime8s><dutyTime8c>1600</dutyTime8c></item>
  </items><totalCount>1</totalCount></body></response>`;

  it("reads each pharmacy's name, place and week", () => {
    const [item] = parseItems(xml);
    expect(item.dutyName).toBe("푸른온누리약국");
    expect(Number(item.wgs84Lat)).toBeCloseTo(37.4795, 4);
    // Monday … Sunday, then holidays.
    expect(weekOf(item)).toBe("0900-2200|||||0900-1800||1000-1600");
  });
});

describe("the phone's pharmacy card", () => {
  const here = { lat: 37.479, lng: 127.0405 };
  const file = {
    weeks: [WEEKDAYS_9_TO_7, LATE_TO_1AM, ALL_DAY],
    holidays: [],
    rows: [
      [3747920, 12704120, "가까운약국", "02-111-1111", 0],
      [3748200, 12704300, "늦게까지약국", "02-222-2222", 1],
      [3750500, 12705500, "스물네시간약국", "02-333-3333", 2],
    ] as [number, number, string, string, number][],
  };

  it("at 11pm puts the ones still open first, reaching further when it has to", () => {
    const friday2300 = Date.UTC(2026, 8, 11, 14, 0);
    const { list, anyOpen } = pickPharmacies(file, here, friday2300);
    expect(anyOpen).toBe(true);
    expect(list[0].name).toBe("늦게까지약국");
    expect(list.filter((p) => p.state.open).map((p) => p.name)).toEqual(["늦게까지약국", "스물네시간약국"]);
    // The nearest one is closed — still listed, after, with when it opens.
    expect(list.find((p) => p.name === "가까운약국")?.state).toMatchObject({ open: false, opens: "09:00" });
  });

  it("draws it with the status on every line, and falls back when there are no hours", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(file)));
    const card = await runPharmacies(
      { kind: "nearby", need: "pharmacy", queries: [], radius: 1500, order: "distance", searchKo: "약국" },
      here,
      "en",
    );
    expect(card?.markdown).toMatch(/Open now|Closed/);
    expect(card?.markdown).toMatch(/국립중앙의료원/);
  });
});
