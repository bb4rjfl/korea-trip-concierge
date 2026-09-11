/**
 * One sight from the phone's list, in detail: what it is, when it is open, how
 * far — fetched by its tourism-board id, so there is no search to get wrong.
 *
 * "Tell me about Gilsang Ceramics", sent as a question, came back as a name and
 * an address; "Tell me about Maeheon Citizen's Forest" as "no hand-written guide
 * yet". The phone knows exactly which listing it showed, so it asks for that one.
 */

import type { SightTask } from "../../../../src/lib/deviceTask.js";
import { shownOnDevice } from "../../../../src/lib/deviceTask.js";
import { DEVICE_STRINGS, distance, fill, walkMinutes, type Lang } from "./strings.js";
import { askChip, directionsChip, kakaoDirections, kakaoPin, metres, HERE_LABEL, type DeviceCard, type Fix } from "./card.js";

interface Detail {
  title: string;
  overview?: string;
  address?: string;
  image?: string;
  homepage?: string;
  hours?: string;
  closedDays?: string;
  contact?: string;
}

const LABELS: Record<Lang, { hours: string; closed: string; contact: string; site: string; credit: string; missing: string }> = {
  en: { hours: "Hours", closed: "Closed", contact: "Contact", site: "Website", credit: "_Korea Tourism Organization (ⓒ한국관광공사)._", missing: "Couldn't load the details just now." },
  ko: { hours: "이용시간", closed: "휴무", contact: "문의", site: "홈페이지", credit: "_출처: 한국관광공사 (ⓒ한국관광공사)._", missing: "지금 상세 정보를 불러오지 못했어요." },
  ja: { hours: "利用時間", closed: "休み", contact: "問い合わせ", site: "ウェブサイト", credit: "_出典：韓国観光公社（ⓒ한국관광공사）_", missing: "詳細を読み込めませんでした。" },
  zh: { hours: "开放时间", closed: "休息日", contact: "咨询", site: "官网", credit: "_来源：韩国观光公社（ⓒ한국관광공사）_", missing: "暂时无法加载详细信息。" },
};

export async function runSight(task: SightTask, at: Fix, lang: Lang): Promise<DeviceCard & { images?: { title: string; image: string }[] }> {
  const t = DEVICE_STRINGS[lang];
  const l = LABELS[lang];
  const detail = (await fetch(`/api/sight/${lang}/${encodeURIComponent(task.id)}?type=${task.type}`)
    .then((r) => (r.ok ? (r.json() as Promise<Detail>) : undefined))
    .catch(() => undefined)) as Detail | undefined;
  const m = metres(at, task);
  const site = detail?.homepage ? (/^https?:\/\//.test(detail.homepage) ? detail.homepage : `https://${detail.homepage}`) : undefined;
  const markdown = [
    `🏛️ **${detail?.title ?? task.title}**`,
    "",
    ...(detail?.overview ? [detail.overview, ""] : detail ? [] : [l.missing, ""]),
    ...(detail?.hours ? [`🕒 **${l.hours}:** ${detail.hours}`] : []),
    ...(detail?.closedDays ? [`🚫 **${l.closed}:** ${detail.closedDays}`] : []),
    `📍 ${detail?.address ? `${detail.address} · ` : ""}${fill(t.walk, { m: distance(m, lang), min: walkMinutes(m) })}`,
    ...(detail?.contact ? [`☎ ${detail.contact}`] : []),
    [`[${t.kakaoMap}](${kakaoPin(task.title, task)})`, `[${t.walkThere}](${kakaoDirections(at, HERE_LABEL[lang], task.title, task, "walk")})`, site ? `[${l.site}](${site})` : ""]
      .filter(Boolean)
      .join(" · "),
    ...(task.tip ? ["", task.tip] : []),
    "",
    l.credit,
    t.onDevice,
  ].join("\n");
  return {
    markdown,
    chips: [directionsChip(task.title, task, lang), askChip("🍽️", t.chip.food), askChip("🏛️", t.chip.sightsNear)],
    local: shownOnDevice(task),
    ...(detail?.image ? { images: [{ title: detail.title, image: detail.image }] } : {}),
  };
}
