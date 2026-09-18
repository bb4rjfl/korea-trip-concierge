/**
 * "A hospital where they speak English" — named, not just a hotline.
 *
 * The emergency card leads with 119/1339/1330, which is right for a crisis. But a
 * visitor asking, calmly, for an English-speaking hospital wants a name and a
 * neighbourhood to go to. These large hospitals run dedicated International
 * Health Centers for foreign patients — a stable, checkable fact. Phone numbers
 * are deliberately NOT printed (a wrong extension is exactly the hallucination
 * this service is built to avoid); connection goes through the verified national
 * lines, which interpret and route.
 */

export interface City {
  key: string;
  match: RegExp;
  label: string;
  hospitals: string[];
}

const CITIES: City[] = [
  {
    key: "seoul",
    match: /seoul|서울|ソウル|首爾|首尔/i,
    label: "Seoul",
    hospitals: [
      "**Severance Hospital** (Sinchon) — Yonsei's International Health Care Center",
      "**Samsung Medical Center** (Irwon) — International Health Services",
      "**Asan Medical Center** (Songpa) — International Clinic",
      "**Seoul National University Hospital** (Jongno) — International Healthcare Center",
    ],
  },
  {
    key: "busan",
    match: /busan|부산|釜山|プサン/i,
    label: "Busan",
    hospitals: [
      "**Pusan National University Hospital** (Seo-gu) — International Healthcare Center",
      "**Inje University Haeundae Paik Hospital** (Haeundae) — foreign-patient services",
    ],
  },
  {
    key: "incheon",
    match: /incheon|인천|仁川/i,
    label: "Incheon",
    hospitals: [
      "**Inha University Hospital** (Jung-gu) — International Health Center (near the airport)",
      "**Gil Medical Center** (Namdong-gu) — foreign-patient services",
    ],
  },
  {
    key: "jeju",
    match: /jeju|제주|济州|済州|濟州/i,
    label: "Jeju",
    hospitals: ["**Jeju National University Hospital** (Jeju City) — the island's main general hospital"],
  },
  {
    key: "daegu",
    match: /daegu|대구|大邱/i,
    label: "Daegu",
    hospitals: [
      "**Kyungpook National University Hospital** (Jung-gu) — International Healthcare Center",
      "**Keimyung University Dongsan Hospital** — foreign-patient services",
    ],
  },
];

/** A calm request for an English-speaking / international / foreigner hospital — not a crisis. */
export function asksEnglishHospital(text: string): boolean {
  const t = text ?? "";
  return (
    /english[-\s]?speaking\s+(?:hospital|doctor|clinic|dentist|gp)|international\s+(?:hospital|clinic|health\s*(?:care|center|centre)|medical)|(?:hospital|clinic|doctor|dentist)\s+(?:that|who)\s+speaks?\s+english|foreigner[-\s]?friendly\s+(?:hospital|clinic|doctor)/i.test(
      t,
    ) ||
    /영어\s*(?:되는|가능한|하는)?\s*(?:병원|의사|치과)|외국인\s*(?:진료|친화).{0,4}병원|국제\s*진료/i.test(t) ||
    /英語.{0,6}(?:病院|医師|クリニック)|(?:会|說|说)英[語语].{0,6}医院|外国人.{0,6}医院|国际诊疗/i.test(t)
  );
}

/**
 * A curated card of English-speaking hospitals for the city named in the text
 * (Seoul when none is named), in English; the caller localizes it.
 */
export function hospitalCard(text: string): string {
  const city = CITIES.find((c) => c.match.test(text ?? ""));
  const c = city ?? CITIES[0];
  const lines = [
    `🏥 **English-speaking hospitals in ${c.label}**`,
    "",
    "For non-urgent care with English-speaking staff, these hospitals run **International Health Centers** for foreign patients — ask for that desk when you arrive:",
    "",
    ...c.hospitals.map((h) => `- ${h}`),
    "",
    "📞 To be connected or interpreted: call **1339** (free, English — medical advice + nearest suitable ER) or **1330** (24-hour Korea Travel Hotline — 3-way medical interpretation, and it can help you phone a clinic).",
    "🚑 A life-threatening emergency is different — dial **119** for a free ambulance (interpretation available).",
    "",
    "_Bring your medicines' **generic names** and your **passport**; the big hospitals take foreign cards._",
  ];
  if (!city) lines.push("", "_These are Seoul's main international hospitals — tell me your city (Busan, Incheon, Daegu, Jeju…) and I'll switch._");
  return lines.join("\n");
}
