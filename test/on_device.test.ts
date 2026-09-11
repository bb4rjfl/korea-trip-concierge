/**
 * "Near me", answered on the phone — and nothing about where anyone is, here.
 *
 * Location used only on the traveller's device, never sent to the operator's
 * system, is the case the Location Information Act leaves outside reporting.
 * That only stays true if it stays true in the code, so these tests hold the
 * line from both sides: no way in for a position on the server, and every
 * "near me" answered with work the phone can do by itself.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { handleChat } from "../web/server/orchestrator.js";
import { nearbyTaskFor } from "../web/server/deviceTask.js";
import type { DeviceTask, NearbyTask } from "../src/lib/deviceTask.js";

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("the server has no way in for a position", () => {
  const serverFiles = [...sources("src"), ...sources("web/server")];

  it("reads nothing but the conversation and the language from a chat request", () => {
    const index = readFileSync("web/server/index.ts", "utf8");
    expect(index).toMatch(/handleChat\(\{ messages, uiLang: body\.uiLang \}\)/);
    expect(index).not.toMatch(/body\.here|body as \{ here|\.lat\b|\.lng\b/);
  });

  it("carries no request-scoped position for a tool to read", () => {
    for (const f of serverFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/hereContext|withHere|getHere\(|parseHere|req\.here/);
    }
  });

  it("has a phone that sends nothing but the conversation and the language", () => {
    const api = readFileSync("web/client/src/api.ts", "utf8");
    const bodies = [...api.matchAll(/body: JSON\.stringify\((\{[^}]*\})\)/g)].map((m) => m[1]);
    expect(bodies.length).toBeGreaterThan(0);
    for (const b of bodies) expect(b).toBe("{ messages: messages.slice(-12), uiLang }");
  });

  it("answers the same whether or not a stale client sends a position anyway", async () => {
    delete process.env.GEMINI_API_KEY;
    const q = { messages: [{ role: "user" as const, content: "where is the nearest pharmacy" }], uiLang: "en" as const };
    const plain = await handleChat(q);
    const withFix = await handleChat({ ...q, here: { lat: 37.479, lng: 127.0405 } } as Parameters<typeof handleChat>[0]);
    const strip = (r: typeof plain) => JSON.stringify({ ...r, meta: { ...r.meta, ms: 0 } });
    expect(strip(withFix)).toBe(strip(plain));
    expect(JSON.stringify(withFix)).not.toMatch(/37\.479|127\.0405/);
  });
});

describe("a question about 'here' becomes work for the phone", () => {
  beforeAll(() => {
    delete process.env.GEMINI_API_KEY;
  });

  const ask = async (content: string, uiLang: "en" | "ko" | "ja" | "zh" = "en") =>
    handleChat({ messages: [{ role: "user", content }], uiLang });
  const nearby = (t?: DeviceTask): NearbyTask => {
    expect(t?.kind).toBe("nearby");
    return t as NearbyTask;
  };

  it("finds a pharmacy by Kakao's category and by name, and keeps only real ones", async () => {
    const t = nearby((await ask("where is the nearest pharmacy")).device);
    expect(t.need).toBe("pharmacy");
    expect(t.queries).toEqual(expect.arrayContaining([{ category: "PM9" }, { keyword: "약국" }]));
    expect(t.pharmacyOnly).toBe(true);
    expect(t.order).toBe("distance");
    // What to know when they get there comes along — it is the same for everyone.
    expect(t.tip).toMatch(/약국/);
  });

  it("reads the need in the traveller's own language", async () => {
    expect(nearby((await ask("근처 약국 어디예요", "ko")).device).need).toBe("pharmacy");
    expect(nearby((await ask("近くのコンビニ", "ja")).device).need).toBe("convenience");
    expect(nearby((await ask("附近的药店", "zh")).device).need).toBe("pharmacy");
  });

  it("searches food by the dish, in the Korean a Korean directory understands", async () => {
    const bbq = nearby((await ask("korean bbq near me")).device);
    expect(bbq.need).toBe("food");
    expect(bbq.queries[0]).toMatchObject({ keyword: "고기집", category: "FD6" });
    expect(bbq.order).toBe("popular");
    const vegan = nearby((await ask("vegan food near me")).device);
    expect(vegan.queries.some((q) => q.keyword === "비건")).toBe(true);
  });

  it("finds the nearest branch of a chain someone names", async () => {
    const t = nearby((await ask("is there a starbucks near me")).device);
    expect(t.queries).toEqual([{ keyword: "스타벅스" }]);
    expect(t.order).toBe("distance");
  });

  it("knows the toilet, which the essentials finder never did", async () => {
    const t = nearby((await ask("where's the nearest toilet")).device);
    expect(t.need).toBe("toilet");
    expect(t.radius).toBeLessThanOrEqual(1000);
  });

  it("looks for an emergency room, not a clinic, and leads with the ambulance number", async () => {
    const res = await ask("my friend collapsed, where is the nearest hospital");
    const t = nearby(res.device);
    expect(t.need).toBe("emergency");
    expect(t.queries[0]).toMatchObject({ keyword: "응급실" });
    expect(t.tip).toMatch(/119/);
  });

  it("answers 'what is around me' with the tourism board's sights", async () => {
    expect((await ask("what is around me")).device?.kind).toBe("sights");
    expect((await ask("anything worth seeing nearby?")).device?.kind).toBe("sights");
  });

  it("reads the next train off the board at the nearest station", async () => {
    expect((await ask("when is the next train near me")).device).toEqual({ kind: "trains" });
  });

  it("leaves a named place to the tools, which search it as before", async () => {
    const res = await ask("is there a pharmacy near Myeongdong");
    expect(res.device).toBeUndefined();
    expect(res.toolMarkdown ?? "").toMatch(/Myeongdong/);
  });
});

describe("a route from where the traveller is standing", () => {
  beforeAll(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("gives the phone the destination — where it is, its station, and which exit", async () => {
    const res = await handleChat({
      messages: [{ role: "user", content: "how do I get to Gyeongbokgung Palace from here" }],
      uiLang: "en",
    });
    const t = res.device;
    expect(t?.kind).toBe("route");
    if (t?.kind !== "route") return;
    expect(t.dest?.lat).toBeCloseTo(37.58, 1);
    expect(t.dest?.lng).toBeCloseTo(126.98, 1);
    expect(t.destStation).toBe("경복궁");
    expect(t.exit ?? "").toMatch(/Exit/);
  });

  it("does not take the place last talked about as where they are now", async () => {
    const res = await handleChat({
      messages: [
        { role: "user", content: "tell me about Hongdae" },
        { role: "assistant", content: "Hongdae is a lively student district." },
        { role: "user", content: "how do I get to Myeongdong from here" },
      ],
      uiLang: "en",
    });
    expect(res.device?.kind).toBe("route");
  });
});

describe("the task builder", () => {
  it("never needs a position to decide what to look for", () => {
    // Everything it reads is the tool, the arguments and the sentence.
    const t = nearbyTaskFor("findForeignerFriendlyStore", { need: "atm" }, "atm near me");
    expect(t).toMatchObject({ kind: "nearby", need: "atm" });
    expect(JSON.stringify(t)).not.toMatch(/lat|lng/);
  });
});
