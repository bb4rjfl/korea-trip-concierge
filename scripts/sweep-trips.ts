/**
 * A sweep of real trips across the whole country, graded by what kind of answer
 * each one got — so the holes are counted by cause instead of found one at a
 * time, whenever someone happens to ask the next question.
 *
 *   npx tsx --env-file=.env scripts/sweep-trips.ts [out.json] [--with-odsay]
 *
 * By default the metered routing service is switched off: the sweep measures
 * what we answer ourselves. Outputs a summary, every failure and every answer
 * that looks wrong (a long walk, an endless ride), and the full text to out.json.
 */

import { writeFileSync } from "node:fs";

const withOdsay = process.argv.includes("--with-odsay");
if (!withOdsay) process.env.TRANSIT_API_KEY = "";
const out = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "trip-sweep.json";

const { getTransitRoute } = await import("../src/tools/getTransitRoute.js");

type Trip = [region: string, from: string, to: string];

/** Where visitors arrive, and where they then go — every province. */
const TRIPS: Trip[] = [
  // Seoul — arrival day
  ["seoul", "Incheon Airport", "Myeongdong"],
  ["seoul", "Incheon Airport", "Hongdae"],
  ["seoul", "Incheon Airport", "Gangnam"],
  ["seoul", "Incheon Airport", "Jamsil"],
  ["seoul", "Incheon Airport", "Itaewon"],
  ["seoul", "Gimpo Airport", "Myeongdong"],
  ["seoul", "Gimpo Airport", "Hongdae"],
  // Seoul — sights
  ["seoul", "Myeongdong", "Gyeongbokgung"],
  ["seoul", "Myeongdong", "N Seoul Tower"],
  ["seoul", "Myeongdong", "Bukchon Hanok Village"],
  ["seoul", "Myeongdong", "Gwangjang Market"],
  ["seoul", "Myeongdong", "Lotte World"],
  ["seoul", "Myeongdong", "Seongsu"],
  ["seoul", "Myeongdong", "Changdeokgung"],
  ["seoul", "Myeongdong", "Ikseon-dong"],
  ["seoul", "Hongdae", "Gyeongbokgung"],
  ["seoul", "Hongdae", "Yeouido"],
  ["seoul", "Hongdae", "Mangwon Market"],
  ["seoul", "Hongdae", "Garosu-gil"],
  ["seoul", "Gangnam", "Bukchon Hanok Village"],
  ["seoul", "Gangnam", "Seoul Forest"],
  ["seoul", "Gangnam", "COEX"],
  ["seoul", "Seoul Station", "Namsan Tower"],
  ["seoul", "Insadong", "Ihwa Mural Village"],
  ["seoul", "Itaewon", "National Museum of Korea"],
  ["seoul", "Jamsil", "Olympic Park"],
  ["seoul", "Myeongdong", "Bukhansan"],
  ["seoul", "Hongdae", "Haneul Park"],
  ["seoul", "Gangnam", "Namhansanseong"],
  ["seoul", "Seongsu", "Ttukseom Resort"],
  ["seoul", "Myeongdong", "Starfield Library"],
  ["seoul", "Dongdaemun", "Naksan Park"],
  // Gyeonggi / Incheon
  ["gyeonggi", "Seoul Station", "Suwon Hwaseong Fortress"],
  ["gyeonggi", "Suwon Station", "Hwaseong Haenggung"],
  ["gyeonggi", "Suwon Station", "Korean Folk Village"],
  ["gyeonggi", "Gangnam", "Everland"],
  ["gyeonggi", "Seoul Station", "Imjingak"],
  ["gyeonggi", "Incheon Airport", "Incheon Chinatown"],
  ["gyeonggi", "Myeongdong", "Nami Island"],
  ["gyeonggi", "Gapyeong Station", "Petite France"],
  // Busan
  ["busan", "Gimhae Airport", "Seomyeon"],
  ["busan", "Busan Station", "Haeundae"],
  ["busan", "Busan Station", "Gwangalli Beach"],
  ["busan", "Seomyeon", "Haedong Yonggungsa"],
  ["busan", "Busan Station", "Taejongdae"],
  ["busan", "Busan Station", "Huinnyeoul Culture Village"],
  ["busan", "Seomyeon", "BEXCO"],
  ["busan", "Busan Station", "Songdo Beach"],
  ["busan", "Busan Station", "Gamcheon Culture Village"],
  ["busan", "Haeundae", "Busan X the Sky"],
  // Jeju
  ["jeju", "Jeju Airport", "Seongsan Ilchulbong"],
  ["jeju", "Jeju Airport", "Hallasan"],
  ["jeju", "Jeju Airport", "Hyeopjae Beach"],
  ["jeju", "Jeju Airport", "Jungmun Tourist Complex"],
  ["jeju", "Jeju Airport", "Seogwipo Maeil Olle Market"],
  ["jeju", "Jeju Airport", "Dongmun Market"],
  ["jeju", "Jeju Airport", "Hamdeok Beach"],
  ["jeju", "Jeju Airport", "Manjanggul Cave"],
  ["jeju", "Jeju Airport", "Aewol"],
  ["jeju", "Seogwipo", "Cheonjiyeon Waterfall"],
  ["jeju", "Seongsan Port", "Udo"],
  // Gyeongju
  ["gyeongju", "Gyeongju Station", "Bulguksa"],
  ["gyeongju", "Gyeongju Station", "Cheomseongdae"],
  ["gyeongju", "Gyeongju Station", "Donggung Palace and Wolji Pond"],
  ["gyeongju", "Gyeongju Station", "Hwangnidan-gil"],
  ["gyeongju", "Gyeongju Bus Terminal", "Bulguksa"],
  ["gyeongju", "Bulguksa", "Seokguram"],
  // Jeonju
  ["jeonju", "Jeonju Station", "Jeonju Hanok Village"],
  ["jeonju", "Jeonju Express Bus Terminal", "Jeonju Hanok Village"],
  ["jeonju", "Jeonju Hanok Village", "Jeonju Nambu Market"],
  // Daegu
  ["daegu", "Dongdaegu Station", "Seomun Market"],
  ["daegu", "Dongdaegu Station", "Kim Kwang-seok Street"],
  ["daegu", "Dongdaegu Station", "E-World"],
  ["daegu", "Daegu Airport", "Dongseongno"],
  // Gwangju / Daejeon
  ["gwangju", "Gwangju Songjeong Station", "Asia Culture Center"],
  ["gwangju", "Gwangju Songjeong Station", "1913 Songjeong Station Market"],
  ["gwangju", "Gwangju", "Juknokwon"],
  ["daejeon", "Daejeon Station", "Sungsimdang"],
  ["daejeon", "Daejeon Station", "Expo Science Park"],
  // Gangwon
  ["gangwon", "Gangneung Station", "Jeongdongjin"],
  ["gangwon", "Gangneung Station", "Anmok Beach"],
  ["gangwon", "Gangneung Station", "Gyeongpo Beach"],
  ["gangwon", "Gangneung Station", "Ojukheon"],
  ["gangwon", "Sokcho Bus Terminal", "Seoraksan"],
  ["gangwon", "Sokcho Bus Terminal", "Sokcho Market"],
  ["gangwon", "Sokcho Bus Terminal", "Abai Village"],
  ["gangwon", "Chuncheon Station", "Nami Island"],
  ["gangwon", "Chuncheon Station", "Myeongdong Dakgalbi Street"],
  ["gangwon", "Chuncheon Station", "Soyang River Skywalk"],
  // Chungcheong
  ["chungcheong", "Gongju Bus Terminal", "Gongsanseong Fortress"],
  ["chungcheong", "Buyeo Bus Terminal", "Busosanseong Fortress"],
  ["chungcheong", "Danyang Station", "Dodamsambong"],
  // Jeolla
  ["jeolla", "Yeosu Expo Station", "Odongdo"],
  ["jeolla", "Yeosu Expo Station", "Yeosu Maritime Cable Car"],
  ["jeolla", "Suncheon Station", "Suncheonman Bay Wetland"],
  ["jeolla", "Suncheon Station", "Suncheon Bay National Garden"],
  ["jeolla", "Suncheon Station", "Naganeupseong Folk Village"],
  ["jeolla", "Mokpo Station", "Yudalsan"],
  ["jeolla", "Mokpo Station", "Mokpo Marine Cable Car"],
  ["jeolla", "Boseong Bus Terminal", "Boseong Green Tea Fields"],
  // Gyeongnam
  ["gyeongnam", "Tongyeong Bus Terminal", "Dongpirang"],
  ["gyeongnam", "Tongyeong Bus Terminal", "Tongyeong Cable Car"],
  ["gyeongnam", "Jinju Station", "Jinjuseong Fortress"],
  ["gyeongnam", "Geoje Bus Terminal", "Wahyeon Port"],
  ["gyeongnam", "Namhae Bus Terminal", "German Village"],
  // Gyeongbuk
  ["gyeongbuk", "Andong Station", "Hahoe Village"],
  ["gyeongbuk", "Andong Station", "Andong Jjimdak Alley"],
  ["gyeongbuk", "Pohang Station", "Homigot"],
  ["gyeongbuk", "Pohang Station", "Space Walk"],
  // Between cities
  ["intercity", "Seoul Station", "Busan"],
  ["intercity", "Seoul Station", "Gangneung"],
  ["intercity", "Seoul Station", "Jeonju"],
  ["intercity", "Seoul Station", "Gyeongju"],
  ["intercity", "Incheon Airport", "Busan"],
  ["intercity", "Seoul", "Jeju"],
  ["intercity", "Busan", "Gyeongju"],
  ["intercity", "Seoul", "Sokcho"],
  ["intercity", "Seoul", "Yeosu"],
];

type Kind = "walk" | "subway" | "bus-seoul" | "bus-national" | "rail-bus" | "bus-bus" | "odsay" | "intercity" | "knowledge" | "no-data" | "fail";

function kindOf(text: string): Kind {
  if (/aren't in our data/.test(text)) return "no-data";
  if (/No direct route|No single subway|Couldn't locate|No transit route|Couldn't reach|temporarily unavailable/.test(text)) return "fail";
  if (/— it's a walk/.test(text)) return "walk";
  if (/— subway, then one bus/.test(text)) return "rail-bus";
  if (/— two buses, one change/.test(text)) return "bus-bus";
  if (/— by subway/.test(text)) return "subway";
  if (/one bus, no transfer/.test(text)) return /national bus open data/.test(text) ? "bus-national" : "bus-seoul";
  if (/pick how you want to go/.test(text)) return "odsay";
  if (/KTX|SRT|ITX|Mugunghwa|express bus|intercity|flight|✈️/i.test(text.split("\n").slice(0, 6).join("\n")) && !/^🚌 \*\*[^\n]*\*\*\n\n(🧗|🚏)/.test(text)) return "intercity";
  return "knowledge";
}

/** Answers that are technically an answer and practically a trap. */
function suspicious(text: string, kind: Kind): string[] {
  const why: string[] = [];
  const walks = [...text.matchAll(/\((\d+(?:\.\d)?) km\)/g)].map((m) => Number(m[1]));
  if (walks.some((k) => k >= 1)) why.push(`walk ${Math.max(...walks)} km`);
  const stops = Number(text.match(/· (\d+) stops/)?.[1] ?? 0);
  if (stops >= 30) why.push(`${stops} stops`);
  const mins = Number(text.match(/about \*\*(\d+) min\*\*/)?.[1] ?? 0);
  if (kind !== "intercity" && mins >= 90) why.push(`${mins} min`);
  const transfers = Number(text.match(/(\d+) transfers/)?.[1] ?? 0);
  if (transfers >= 3) why.push(`${transfers} transfers`);
  return why;
}

const results: { region: string; from: string; to: string; kind: Kind; ms: number; flags: string[]; text: string }[] = [];
let next = 0;
async function worker() {
  while (next < TRIPS.length) {
    const [region, from, to] = TRIPS[next++];
    const t = Date.now();
    let text = "";
    try {
      const r = (await getTransitRoute.handler({ from, to, language: "en" })) as { content?: { text?: string }[] };
      text = String(r?.content?.[0]?.text ?? "").split("\n---\n")[0];
    } catch (e) {
      text = `THREW ${String(e)}`;
    }
    const kind = text.startsWith("THREW") ? "fail" : kindOf(text);
    results.push({ region, from, to, kind, ms: Date.now() - t, flags: suspicious(text, kind), text });
    process.stdout.write(kind === "fail" ? "x" : ".");
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log("\n");

const order = new Map(TRIPS.map((t, i) => [`${t[1]}→${t[2]}`, i]));
results.sort((a, b) => order.get(`${a.from}→${a.to}`)! - order.get(`${b.from}→${b.to}`)!);
writeFileSync(out, JSON.stringify(results, null, 2));

const count = (k: Kind) => results.filter((r) => r.kind === k).length;
const kinds: Kind[] = ["walk", "subway", "bus-seoul", "bus-national", "rail-bus", "bus-bus", "odsay", "intercity", "knowledge", "no-data", "fail"];
console.log(`${results.length} trips${withOdsay ? " (routing service on)" : " (routing service off)"}`);
console.log(kinds.map((k) => `${k} ${count(k)}`).join(" · "));
const regions = [...new Set(results.map((r) => r.region))];
for (const region of regions) {
  const rs = results.filter((r) => r.region === region);
  const real = rs.filter((r) => ["walk", "subway", "bus-seoul", "bus-national", "rail-bus", "bus-bus", "odsay", "intercity"].includes(r.kind)).length;
  console.log(`  ${region.padEnd(12)} planned ${real}/${rs.length} · knowledge ${rs.filter((r) => r.kind === "knowledge").length} · fail ${rs.filter((r) => r.kind === "fail").length}`);
}
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
console.log(`latency p50 ${ms[Math.floor(ms.length / 2)]}ms · p90 ${ms[Math.floor(ms.length * 0.9)]}ms · max ${ms[ms.length - 1]}ms`);
console.log("\nFAILED");
for (const r of results.filter((r) => r.kind === "fail" || r.kind === "no-data")) console.log(`  [${r.region}] ${r.from} → ${r.to}: ${r.text.split("\n").find((l) => l.trim())?.slice(0, 70)}`);
console.log("\nKNOWLEDGE ONLY (no planned route)");
for (const r of results.filter((r) => r.kind === "knowledge")) console.log(`  [${r.region}] ${r.from} → ${r.to}`);
console.log("\nSUSPICIOUS");
for (const r of results.filter((r) => r.flags.length)) console.log(`  [${r.region}] ${r.from} → ${r.to} (${r.kind}): ${r.flags.join(", ")}`);
console.log(`\nfull text: ${out}`);
process.exit(0);
