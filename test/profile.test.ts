/**
 * The profile layer: what the traveller said about their own trip, and whether
 * the course actually changes because of it. These are the assertions that keep
 * "recommendation" from decaying back into "one hardcoded course, pushed hard".
 */

import { describe, it, expect } from "vitest";
import { readProfile, isEmptyProfile, profileNote } from "../src/lib/profile.js";
import { allowedBy, composeCourse, distinctiveWords, proximity, resolvePersonas, STRENUOUS, PRICEY } from "../src/lib/courses.js";
import { recommendTripCourse } from "../src/tools/recommendTripCourse.js";
import { livePool } from "../src/lib/livePool.js";

describe("readProfile — reading the traveller out of their own words", () => {
  it("hears a budget in four languages", () => {
    for (const said of ["we are on a budget", "저렴한 곳으로", "安く済ませたい", "想省钱"]) {
      expect(readProfile([said]).budget, said).toBe("low");
    }
  });

  it("hears pace, both directions", () => {
    expect(readProfile(["we want to take it easy"]).pace).toBe("relaxed");
    expect(readProfile(["천천히 다니고 싶어요"]).pace).toBe("relaxed");
    expect(readProfile(["we want to see as much as possible"]).pace).toBe("packed");
  });

  it("hears limited walking without being told the words 'limited walking'", () => {
    for (const said of [
      "my mother walks slowly",
      "my knee is bad today",
      "we have a stroller",
      "다리가 아파서 많이 못 걷겠어요",
      "車椅子で行けますか",
    ]) {
      expect(readProfile([said]).mobility, said).toBe("easy");
    }
  });

  it("hears children and diet", () => {
    expect(readProfile(["travelling with a toddler"]).withKids).toBe(true);
    expect(readProfile(["we are vegetarian"]).dietary).toContain("vegetarian");
    expect(readProfile(["halal food only please"]).dietary).toContain("halal");
  });

  it("turns a refusal into a theme to avoid", () => {
    const p = readProfile(["not another market please"]);
    expect(p.dislikes).toContain("market");
    expect(p.likes).not.toContain("market");
  });

  it("lets a later 'I liked that' outrank an earlier dismissal", () => {
    const p = readProfile(["not another market", "actually I loved that market"]);
    expect(p.dislikes).not.toContain("market");
    expect(p.likes).toContain("market");
  });

  it("stays empty when the traveller only asked a question", () => {
    const p = readProfile(["what is the weather in Seoul", "how do I get to Hongdae"]);
    expect(isEmptyProfile(p)).toBe(true);
    expect(profileNote(p)).toBe("");
  });

  it("says back what it took, so a wrong read is visible and correctable", () => {
    const note = profileNote(readProfile(["on a budget, and my mother walks slowly, with kids"]));
    expect(note).toMatch(/on a budget/);
    expect(note).toMatch(/less walking/);
    expect(note).toMatch(/with children/);
  });
});

describe("allowedBy — the profile has to actually remove stops", () => {
  const uphill = { name: "Naksan Park uphill walk", note: "A steep climb to the fortress wall", themes: ["nature"], area: "Jongno" } as never;
  const pricey = { name: "Shinsegae Department Store", note: "Luxury boutiques", themes: ["shopping"], area: "Myeongdong" } as never;
  const plain = { name: "Cheonggyecheon Stream walk", note: "A flat stream-side walk", themes: ["nature"], area: "Jongno" } as never;

  it("drops a climb for someone who told us walking is hard", () => {
    expect(allowedBy(uphill, { dietary: [], dislikes: [], likes: [] })).toBe(true);
    expect(allowedBy(uphill, { mobility: "easy", dietary: [], dislikes: [], likes: [] })).toBe(false);
    expect(allowedBy(plain, { mobility: "easy", dietary: [], dislikes: [], likes: [] })).toBe(true);
  });

  it("drops a department store for someone on a budget", () => {
    expect(allowedBy(pricey, { budget: "low", dietary: [], dislikes: [], likes: [] })).toBe(false);
  });

  it("drops a disliked theme outright", () => {
    expect(allowedBy(plain, { dietary: [], dislikes: ["nature"], likes: [] })).toBe(false);
  });

  it("PRICEY matches a mall as a word, not a backslash", () => {
    expect(PRICEY.test("COEX Mall")).toBe(true);
    expect(PRICEY.test("Small alley cafe")).toBe(false);
    expect(STRENUOUS.test("steep uphill trail")).toBe(true);
    expect(PRICEY.test("Space for exhibitions")).toBe(false);
  });
});

describe("composeCourse — the same ask yields different days", () => {
  it("gives a different set of stops for each variant", () => {
    const names = [0, 1, 2].map((v) =>
      composeCourse(resolvePersonas("foodie"), "1-day", [], "Seoul", false, v).days[0].stops.map((s) => s.spot.name).join("|"),
    );
    expect(new Set(names).size).toBeGreaterThan(1);
  });

  it("shortens the day when the traveller asked for unhurried", () => {
    const normal = composeCourse(resolvePersonas("foodie"), "1-day", [], "Seoul", false, 0);
    const slow = composeCourse(resolvePersonas("foodie"), "1-day", [], "Seoul", false, 0, undefined, {
      pace: "relaxed",
      dietary: [],
      dislikes: [],
      likes: [],
    });
    expect(slow.days[0].stops.length).toBeLessThan(normal.days[0].stops.length);
  });

  it("keeps a refused theme out of the day entirely", () => {
    const course = composeCourse(resolvePersonas("foodie"), "1-day", [], "Seoul", false, 0, undefined, {
      dietary: [],
      dislikes: ["market"],
      likes: [],
    });
    for (const stop of course.days.flatMap((d) => d.stops)) {
      expect(stop.spot.themes, stop.spot.name).not.toContain("market");
    }
  });
});

describe("recommendTripCourse — the profile reaches the card", () => {
  it("prints what it planned for when the traveller said something about themselves", async () => {
    const res = await recommendTripCourse.handler({
      persona: "couple",
      duration: "1-day",
      notes: "we are on a budget and my mother walks slowly",
    });
    expect(res.content[0].text).toMatch(/Planned for:.*on a budget/);
  });

  it("says nothing about a profile it never heard", async () => {
    const res = await recommendTripCourse.handler({ persona: "couple", duration: "1-day" });
    expect(res.content[0].text).not.toMatch(/Planned for:/);
  });
});

describe("\"another one\" has to mean another one", () => {
  it("never repeats a stop across consecutive variants", () => {
    const seen = new Set<string>();
    for (let v = 0; v < 4; v++) {
      const course = composeCourse(resolvePersonas("family"), "1-day", [], "Seoul", false, v);
      for (const stop of course.days.flatMap((d) => d.stops)) {
        expect(seen.has(stop.spot.id), `variant ${v} repeated ${stop.spot.name}`).toBe(false);
        seen.add(stop.spot.id);
      }
    }
  });

  it("still fills a day rather than thinning out once the pool runs low", () => {
    for (let v = 0; v < 8; v++) {
      const course = composeCourse(resolvePersonas("foodie"), "1-day", [], "Gyeongju", false, v);
      expect(course.days[0].stops.length, `variant ${v}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("the live pool only offers things that are places to go", () => {
  it("carries no clinics, no dated events, and no truncated blurbs", async () => {
    const pool = await livePool("Seoul");
    if (!pool.length) return; // offline / key-less runs have nothing to assert on
    expect(pool.length).toBeGreaterThan(100);
    for (const spot of pool) {
      expect(spot.name, "medical business in a tourist course").not.toMatch(
        /surgery|plastic surg|dermatolog|\bclinic\b|hospital|의원|성형/i,
      );
      expect(spot.name, "a dated event is not a stop").not.toMatch(/exhibition|festival|concert|\b20\d\d\b/i);
      // A blurb we cut ourselves ends on a word, with an ellipsis to show it.
      if (spot.note.length >= 150) expect(spot.note).toMatch(/[.!?…]$/);
    }
  });
});

describe("a day visits a place once", () => {
  it("never puts the same landmark in twice under two listings", () => {
    for (const persona of ["family", "foodie", "couple"]) {
      for (let v = 0; v < 4; v++) {
        const course = composeCourse(resolvePersonas(persona), "3-day", [], "Seoul", false, v);
        {
          // Across the whole trip, not just within a day — "Gwangjang Market" on
          // Monday and "Gwangjang Market street food" on Tuesday is one market.
          const words = course.days.flatMap((d) => d.stops).map((st) => distinctiveWords(st.spot.name));
          for (let i = 0; i < words.length; i++)
            for (let j = i + 1; j < words.length; j++) {
              const shared = words[i].filter((w) => words[j].includes(w));
              expect(shared.length, `${persona} v${v}`).toBeLessThan(2);
            }
        }
      }
    }
  });
});

describe("a stated diet steers the food stops", () => {
  const bbq = { id: "bbq", name: "Korean BBQ + somaek", note: "Grill samgyeopsal at the table", themes: ["food"], area: "Hongdae", zone: "west", blocks: ["evening"] } as never;
  const jokbal = { id: "j", name: "Jokbal alley", note: "Braised pig trotters", themes: ["food"], area: "Jongno", zone: "old-north", blocks: ["evening"] } as never;
  const bibim = { id: "b", name: "Tongin Market (coin lunchbox)", note: "Make-your-own dosirak", themes: ["food"], area: "Seochon", zone: "old-north", blocks: ["afternoon"] } as never;

  it("keeps a vegetarian away from the grill", () => {
    expect(allowedBy(bbq, { dietary: ["vegetarian"], dislikes: [], likes: [] })).toBe(false);
    expect(allowedBy(bibim, { dietary: ["vegetarian"], dislikes: [], likes: [] })).toBe(true);
  });

  it("keeps pork off a halal traveller's day but leaves the rest", () => {
    expect(allowedBy(jokbal, { dietary: ["halal"], dislikes: [], likes: [] })).toBe(false);
    expect(allowedBy(bibim, { dietary: ["halal"], dislikes: [], likes: [] })).toBe(true);
  });

  it("leaves everything alone when no diet was mentioned", () => {
    expect(allowedBy(bbq, { dietary: [], dislikes: [], likes: [] })).toBe(true);
  });
});

describe("an evening question gets an evening", () => {
  it("ends the plan after dark instead of starting it at breakfast", async () => {
    const res = await recommendTripCourse.handler({
      persona: "family",
      duration: "half-day",
      notes: "what should we do on the first evening near Insadong",
    });
    const text = res.content[0].text;
    expect(text).toMatch(/Evening Seoul course/);
    expect(text).not.toMatch(/Half-day Seoul course/);
  });

  it("leaves an ordinary half-day alone", async () => {
    const res = await recommendTripCourse.handler({ persona: "family", duration: "half-day" });
    expect(res.content[0].text).toMatch(/Half-day Seoul course/);
  });
});

describe("proximity — a day should hold together geographically", () => {
  const jongno1 = { name: "A", area: "Jongno", zone: "old-north", themes: [], blocks: [], id: "a", note: "" } as never;
  const jongno2 = { name: "B", area: "Jongno", zone: "old-north", themes: [], blocks: [], id: "b", note: "" } as never;
  const bukchon = { name: "C", area: "Bukchon", zone: "old-north", themes: [], blocks: [], id: "c", note: "" } as never;
  const nowon = { name: "D", area: "Nowon", zone: "north", themes: [], blocks: [], id: "d", note: "" } as never;
  const nowhere = { name: "E", area: "Seoul", zone: "any", themes: [], blocks: [], id: "e", note: "" } as never;

  it("is neutral for the first stop of the day", () => {
    expect(proximity(nowon, [])).toBe(0);
  });

  it("prefers the same neighbourhood, then the same zone, over across town", () => {
    expect(proximity(jongno2, [jongno1])).toBeGreaterThan(proximity(bukchon, [jongno1]));
    expect(proximity(bukchon, [jongno1])).toBeGreaterThan(proximity(nowon, [jongno1]));
  });

  it("pulls much harder for someone who said walking is hard", () => {
    const easy = { mobility: "easy" as const, dietary: [], dislikes: [], likes: [] };
    expect(proximity(nowon, [jongno1], easy)).toBeLessThan(proximity(nowon, [jongno1]));
    expect(proximity(jongno2, [jongno1], easy)).toBeGreaterThan(proximity(jongno2, [jongno1]));
  });

  it("treats an unplaceable stop as a gamble, and as far away when distance is the problem", () => {
    expect(proximity(nowhere, [jongno1])).toBe(-1);
    const easy = { mobility: "easy" as const, dietary: [], dislikes: [], likes: [] };
    expect(proximity(nowhere, [jongno1], easy)).toBeLessThan(-1);
  });

  it("keeps a relaxed day inside one part of the city", () => {
    const course = composeCourse(resolvePersonas("culture"), "1-day", [], "Seoul", false, 0, [], {
      pace: "relaxed",
      mobility: "easy",
      dietary: [],
      dislikes: [],
      likes: [],
    });
    const zones = new Set(course.days[0].stops.map((s) => s.spot.zone).filter((z) => z !== "any"));
    expect(zones.size, [...zones].join(",")).toBeLessThanOrEqual(2);
  });

  it("does not print the same block label twice on a packed day", () => {
    const course = composeCourse(resolvePersonas("family"), "1-day", [], "Seoul", false, 0, [], {
      pace: "packed",
      dietary: [],
      dislikes: [],
      likes: [],
    });
    const labels = course.days[0].stops.map((s) => s.block);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
