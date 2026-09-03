/**
 * Everything this service knows, as documents the retrieval layer can rank.
 *
 * The knowledge was always here — spots, landmarks, neighbourhoods, dishes and
 * their allergens, the twelve Korean-system guides, payment situations, manners,
 * seasons, mobility, malls. Each one was reachable only through the regular
 * expression its own tool used to recognise itself, which is why a sentence that
 * did not contain the expected word reached none of them.
 *
 * This turns each into a document with two things attached: the text a query
 * might match, and the tool call that answers it. A retrieval hit therefore
 * becomes a real answer from the real tool, not a paraphrase of a snippet.
 *
 * Live candidates are added separately once the pool has loaded, because they
 * arrive over the network and the rest of this is available at import.
 */

import { ALL_SPOTS, type Spot } from "./courses.js";
import { LANDMARKS } from "./landmarks.js";
import { AREAS } from "../tools/getAreaGuide.js";
import { DISHES } from "../tools/translateMenuContext.js";
import { SERVICES } from "../tools/explainKoreanService.js";
import { GUIDES } from "../tools/explainPayment.js";
import { ETIQUETTE_CARD, ACCESSIBILITY_CARD } from "./culture.js";
import { BY_MONTH } from "./seasons.js";
import { CITIES } from "./gettingAround.js";
import { SEOUL_MALLS, BUSAN_MALLS } from "./malls.js";
import { setCorpus, type Doc } from "./retrieval.js";

/**
 * The alternatives a regular expression enumerates are the words its author
 * expected — exactly the vocabulary worth indexing. Stripping the syntax turns
 * a matcher back into the search terms it was built from.
 */
function wordsFromPattern(re: RegExp): string {
  return re.source
    .replace(/\\[bdsSwWpP]\{?[^}]*\}?/g, " ")
    .replace(/\(\?[:!=<][^)]*\)/g, " ")
    .replace(/[()[\]{}?*+^$|.\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function spotDoc(spot: Spot, live = false): Doc {
  const city = spot.city ?? "Seoul";
  return {
    id: live ? `live:${spot.id}` : `spot:${spot.id}`,
    kind: "spot",
    title: spot.name,
    area: spot.area,
    // Themes are the closest thing we have to how a visitor describes a want —
    // "quiet", "view", "family" — so they belong in the searchable text even
    // though no card ever prints them.
    text: [spot.name, spot.area, city, spot.themes.join(" "), spot.note, spot.access, spot.blocks.join(" ")]
      .filter(Boolean)
      .join(" · "),
    route: { tool: "getNowInfo", args: { place: spot.name } },
  };
}

function staticDocs(): Doc[] {
  const docs: Doc[] = [];

  for (const spot of ALL_SPOTS) docs.push(spotDoc(spot));

  for (const l of LANDMARKS) {
    docs.push({
      id: `landmark:${l.name}`,
      kind: "landmark",
      title: l.name,
      text: [l.name, l.aliases.join(" "), l.hoursLabel, (l as { note?: string }).note].filter(Boolean).join(" · "),
      route: { tool: "getNowInfo", args: { place: l.name } },
    });
  }

  for (const a of AREAS) {
    docs.push({
      id: `area:${a.name}`,
      kind: "area",
      title: a.name,
      area: a.name,
      text: [a.name, wordsFromPattern(a.keys), a.blurb, a.spots.join(" · "), a.getThere, Object.values(a.interests).join(" · ")]
        .filter(Boolean)
        .join(" · "),
      route: { tool: "getAreaGuide", args: { area: a.name.replace(/\s*\([^)]*\)\s*$/, "") } },
    });
  }

  for (const d of DISHES) {
    docs.push({
      id: `dish:${d.en}`,
      kind: "dish",
      title: d.en,
      // Allergens spelled out, because "peanut allergy" has to reach the dishes
      // that contain peanuts — that question was being answered with a parse error.
      text: [d.en, wordsFromPattern(d.match), d.desc, `allergens: ${d.allergens.join(", ")}`, `spice level ${d.spice}`]
        .join(" · "),
      route: { tool: "translateMenuContext", args: { menuText: d.en } },
    });
  }

  for (const s of SERVICES) {
    docs.push({
      id: `service:${s.label}`,
      kind: "service",
      title: s.label,
      text: [s.label, wordsFromPattern(s.match), s.blocker, s.workaround.join(" · "), s.twin, s.fallback]
        .filter(Boolean)
        .join(" · "),
      route: { tool: "explainKoreanService", args: { service: s.label } },
    });
  }

  for (const g of GUIDES) {
    docs.push({
      id: `payment:${g.label}`,
      kind: "payment",
      title: g.label,
      text: [g.label, wordsFromPattern(g.match), g.works.join(" · "), g.avoid.join(" · "), g.tip].join(" · "),
      route: { tool: "explainPayment", args: { situation: g.label } },
    });
  }

  // The guidance cards. Each is reachable today only through its own detector,
  // so "is it rude to tip" finds manners and "am I allowed to tip" finds nothing.
  for (const card of [ETIQUETTE_CARD, ACCESSIBILITY_CARD]) {
    docs.push({
      id: `card:${card.title}`,
      kind: "card",
      title: card.title.replace(/^[^\p{L}]+/u, ""),
      text: [card.title, card.intro, ...card.sections.flatMap((s) => [s.heading, ...s.points])].join(" · "),
    });
  }

  for (const [month, season] of Object.entries(BY_MONTH)) {
    docs.push({
      id: `card:season:${month}`,
      kind: "card",
      title: season.label,
      text: [season.label, season.feel, season.whatsOn.join(" · "), season.pack, season.caveat].filter(Boolean).join(" · "),
    });
  }

  for (const { match, guide } of CITIES) {
    docs.push({
      id: `card:mobility:${guide.city}`,
      kind: "card",
      title: `Getting around ${guide.city}`,
      area: guide.city,
      text: [guide.city, wordsFromPattern(match), guide.headline, guide.modes.join(" · "), guide.watch].join(" · "),
    });
  }

  for (const mall of [...SEOUL_MALLS, ...BUSAN_MALLS]) {
    docs.push({
      id: `spot:mall:${mall.name}`,
      kind: "spot",
      title: mall.name,
      area: mall.area,
      text: [mall.name, mall.ko, mall.area, mall.draw, mall.getThere, "mall shopping centre department store indoors"].join(" · "),
      route: { tool: "getNowInfo", args: { place: mall.name } },
    });
  }

  return docs;
}

let liveDocs: Doc[] = [];

/** Rebuild the index from the static knowledge plus whatever live pool we hold. */
function install(): void {
  setCorpus([...staticDocs(), ...liveDocs]);
}

/**
 * Fold a city's live candidate pool into the corpus.
 *
 * Called after the pool loads, and again once its background coordinate pass
 * has filled in station exits — the second call is what makes "which exit" a
 * searchable thing rather than only a printed one.
 */
export function indexLivePool(spots: Spot[]): void {
  const byId = new Map(liveDocs.map((d) => [d.id, d]));
  for (const spot of spots) {
    const doc = spotDoc(spot, true);
    byId.set(doc.id, doc);
  }
  liveDocs = [...byId.values()];
  install();
}

/** Build the index from static knowledge. Safe to call more than once. */
export function buildCorpus(): void {
  install();
}
