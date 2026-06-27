import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * getAreaGuide — curated one-paragraph neighborhood guides for foreign visitors.
 * Starts with a hand-picked set of high-traffic Seoul areas; expandable. Value
 * over plain LLM: concise, foreigner-oriented, links into the other tools.
 */

interface Area {
  keys: RegExp;
  name: string;
  blurb: string;
  spots: string[];
  getThere: string;
  interests: Partial<Record<"food" | "shopping" | "history" | "nightlife", string>>;
}

const AREAS: Area[] = [
  {
    keys: /(myeong-?dong|명동)/i,
    name: "Myeongdong (명동)",
    blurb:
      "Seoul's busiest shopping & street-food district — neon-lit, packed, and the most foreigner-ready area in the city (English signage, currency exchange, tax-free shops).",
    spots: ["Myeongdong street-food alley", "Myeongdong Cathedral", "Lotte Department Store", "Namsan Cable Car (nearby)"],
    getThere: "Myeongdong Stn (Line 4) or Euljiro 1-ga (Line 2).",
    interests: { food: "Street stalls (tornado potato, grilled cheese lobster) after 4pm.", shopping: "Cosmetics flagships and tax-free department stores." },
  },
  {
    keys: /(hongdae|hongik|홍대)/i,
    name: "Hongdae (홍대)",
    blurb:
      "Youthful art-and-music quarter around Hongik University — indie clubs, buskers, themed cafés, and budget eats. Liveliest at night.",
    spots: ["Hongdae busking street", "Gyeongui Line Forest Park", "Trick Eye Museum", "indie live clubs"],
    getThere: "Hongik Univ. Stn (Line 2 / AREX from the airport).",
    interests: { nightlife: "Clubs and live houses peak Fri–Sat after 10pm.", food: "Cheap eats, themed cafés, late-night pojangmacha." },
  },
  {
    keys: /(gangnam|강남)/i,
    name: "Gangnam (강남)",
    blurb:
      "Upscale business-and-fashion district — wide boulevards, flagship stores, K-beauty clinics, and polished dining. Less gritty, more premium.",
    spots: ["Gangnam Style statue (COEX)", "COEX Mall & Starfield Library", "Bongeunsa Temple", "Garosu-gil tree-lined street"],
    getThere: "Gangnam Stn (Line 2) or Samseong Stn (Line 2) for COEX.",
    interests: { shopping: "COEX Mall + Garosu-gil boutiques.", food: "Trendy restaurants and dessert cafés." },
  },
  {
    keys: /(insadong|insa-?dong|인사동)/i,
    name: "Insadong (인사동)",
    blurb:
      "Traditional-culture street — hanok teahouses, calligraphy and craft shops, galleries. The easiest place to feel 'old Korea' on foot.",
    spots: ["Ssamzigil shopping maze", "traditional teahouses", "antique & craft shops", "Jogyesa Temple (nearby)"],
    getThere: "Anguk Stn (Line 3) Exit 6.",
    interests: { history: "Pair with Gyeongbokgung & Bukchon Hanok Village, both a short walk away.", shopping: "Crafts, hanji paper, souvenirs." },
  },
  {
    keys: /(seongsu|성수)/i,
    name: "Seongsu (성수동)",
    blurb:
      "Former factory district turned hip café-and-concept-store hub — 'Brooklyn of Seoul'. Industrial-chic cafés, pop-ups, and walk-in dining.",
    spots: ["converted-warehouse cafés", "Seongsu handmade-shoe street", "Seoul Forest park", "designer pop-up stores"],
    getThere: "Seongsu Stn (Line 2) or Seoul Forest Stn (Bundang Line).",
    interests: { food: "Specialty coffee and walk-in brunch spots.", shopping: "Concept stores and pop-ups." },
  },
  {
    keys: /(itaewon|이태원)/i,
    name: "Itaewon (이태원)",
    blurb:
      "Seoul's most international quarter — global restaurants, English everywhere, halal options, and a buzzing nightlife. The easiest area for non-Korean speakers.",
    spots: ["world-cuisine restaurants", "Itaewon antique furniture street", "Leeum Museum of Art", "Gyeongridan-gil cafés"],
    getThere: "Itaewon Stn (Line 6).",
    interests: { food: "Halal, Western, and global cuisines with English menus.", nightlife: "Bars and clubs, busiest Fri–Sat." },
  },
  {
    keys: /(bukchon|북촌)/i,
    name: "Bukchon Hanok Village (북촌한옥마을)",
    blurb:
      "A preserved hillside of traditional hanok houses between two palaces — postcard alleys and city views. A residential area, so visit quietly and by day.",
    spots: ["Bukchon 8 Views photo spots", "hanok alleys", "Gyeongbokgung & Changdeokgung (both adjacent)", "craft workshops"],
    getThere: "Anguk Stn (Line 3) Exit 2.",
    interests: { history: "Pair with Gyeongbokgung, Insadong, and Samcheongdong on foot." },
  },
  {
    keys: /(dongdaemun|동대문|ddp)/i,
    name: "Dongdaemun (동대문)",
    blurb:
      "24-hour fashion-and-shopping district anchored by the spaceship-like DDP. Wholesale malls, late-night shopping, and street food that never sleeps.",
    spots: ["Dongdaemun Design Plaza (DDP)", "all-night fashion malls", "Gwangjang Market (nearby)", "Heunginjimun Gate"],
    getThere: "Dongdaemun History & Culture Park Stn (Lines 2/4/5).",
    interests: { shopping: "Wholesale & retail fashion malls, many open past midnight.", food: "Late-night street food and Gwangjang Market." },
  },

  // ── More Seoul ───────────────────────────────────────────────────────────────
  {
    keys: /(yeouido|여의도)/i,
    name: "Yeouido (여의도)",
    blurb:
      "Seoul's riverfront finance island — skyscrapers, the National Assembly, and a huge Han River park that's the city's go-to picnic and cherry-blossom spot.",
    spots: ["Yeouido Hangang Park (picnics, bike rental)", "The Hyundai Seoul mall", "63 Building & aquarium", "spring cherry-blossom road (Yunjungno)"],
    getThere: "Yeouido or Yeouinaru Stn (Line 5); Yeouido also on Line 9.",
    interests: { shopping: "The Hyundai Seoul — Korea's flashiest department store.", food: "Riverside chicken-and-beer delivered right to your picnic mat." },
  },
  {
    keys: /(jamsil|lotte\s*world|롯데월드|잠실)/i,
    name: "Jamsil / Lotte World (잠실)",
    blurb:
      "Family-and-entertainment hub in southeast Seoul, built around Lotte World theme park and the soaring Lotte World Tower — Korea's tallest building. (Lotte World is a **ticketed theme park** and the Seoul Sky observatory is a separate ticket — check hours and book ahead, especially on weekends.)",
    spots: ["Lotte World Adventure (indoor + outdoor theme park)", "Seoul Sky observatory (Lotte World Tower)", "Lotte World Mall & Aquarium", "Seokchon Lake (cherry blossoms)"],
    getThere: "Jamsil Stn (Lines 2/8) — exits connect straight into the complex.",
    interests: { shopping: "Lotte World Mall + duty-free under one roof.", food: "Mall food courts and lakeside cafés." },
  },
  {
    keys: /(ikseon-?dong|익선동)/i,
    name: "Ikseon-dong (익선동)",
    blurb:
      "A maze of restored 1920s hanok alleys turned into Seoul's prettiest café-and-bistro warren — old tile roofs, tiny courtyards, big photo appeal. Compact and very walkable.",
    spots: ["hanok cafés & dessert bars", "vintage clothing nooks", "fusion bistros in old courtyards", "Nakwon instrument arcade (nearby)"],
    getThere: "Jongno 3-ga Stn (Lines 1/3/5), Exit 4 or 6.",
    interests: { food: "Hanok cafés and creative small-plate restaurants — book ahead at weekends.", history: "1920s hanok alleys; pair with Insadong & Jongmyo nearby." },
  },
  {
    keys: /(euljiro|을지로)/i,
    name: "Euljiro (을지로)",
    blurb:
      "By day a gritty district of printing shops and hardware shops; by night the hip 'Hipjiro' — speakeasy bars and retro cafés hidden up worn stairwells and behind unmarked doors.",
    spots: ["hidden rooftop & speakeasy bars", "retro 'newtro' cafés", "Euljiro Nogari Alley (beer & dried-pollack)", "tool & lighting shop lanes"],
    getThere: "Euljiro 3-ga Stn (Lines 2/3) or Euljiro 1-ga (Line 2).",
    interests: { nightlife: "Speakeasy bars and the open-air Nogari Alley, busiest after 7pm.", food: "Old-school grilled-fish and noodle spots between the workshops." },
  },
  {
    keys: /(samcheong-?dong|samcheong|삼청동)/i,
    name: "Samcheong-dong (삼청동)",
    blurb:
      "A genteel hillside street running up beside Gyeongbokgung — galleries, boutiques, and hanok cafés with a calmer, leafier feel than busier Insadong next door.",
    spots: ["art galleries & craft boutiques", "hanok cafés with palace-wall views", "National Folk Museum (nearby)", "Bukchon Hanok Village (uphill)"],
    getThere: "Anguk Stn (Line 3) Exit 1, then a 10-min walk up.",
    interests: { history: "Walk the Gyeongbokgung stone wall and on to Bukchon.", food: "Quiet hanok cafés, brunch, and traditional sujebi." },
  },
  {
    keys: /(garosu-?gil|garosugil|sinsa|신사|가로수길)/i,
    name: "Garosu-gil / Sinsa (가로수길)",
    blurb:
      "A tree-lined boutique avenue in upmarket Sinsa, just north of Gangnam — designer flagships, beauty stores, and stylish cafés, with quieter 'Serosu-gil' back lanes off the main strip.",
    spots: ["Garosu-gil flagship boutiques", "K-beauty & fashion concept stores", "Serosu-gil back-alley cafés", "Apgujeong Rodeo (nearby)"],
    getThere: "Sinsa Stn (Line 3 / Sinbundang Line) Exit 8.",
    interests: { shopping: "Designer flagships and indie boutiques along the ginkgo-lined street.", food: "Brunch spots, dessert cafés, and rooftop bars." },
  },

  // ── Busan ────────────────────────────────────────────────────────────────────
  {
    keys: /(haeundae|해운대)/i,
    name: "Haeundae (해운대, Busan)",
    blurb:
      "Busan's flagship beach resort district — a wide sandy bay backed by high-rises, seafood restaurants, and a scenic seaside train. The city's summer playground.",
    spots: ["Haeundae Beach", "Blue Line Park beach train & sky capsule", "Dongbaek Island coastal walk", "Haeundae Market (street food)"],
    getThere: "Haeundae Stn (Busan Metro Line 2), Exit 3 or 5.",
    interests: { food: "Fresh raw fish (hoe) and grilled seafood by the bay.", nightlife: "Beachfront bars and night views of Gwangan Bridge." },
  },
  {
    keys: /(seomyeon|서면)/i,
    name: "Seomyeon (서면, Busan)",
    blurb:
      "Busan's downtown crossroads and busiest shopping-and-nightlife hub — department stores, an underground shopping arcade, medical/beauty clinics, and endless eating streets.",
    spots: ["Seomyeon underground shopping arcade", "Seomyeon 1-beonga eating & bar street", "Bujeon Market", "department stores (Lotte, Judies)"],
    getThere: "Seomyeon Stn (Busan Metro Lines 1/2) — the city's main interchange.",
    interests: { food: "Dwaeji-gukbap (pork-soup rice), Busan's signature dish.", nightlife: "Bars, clubs, and pojangmacha around 1-beonga." },
  },
  {
    keys: /(gwangalli|gwangan|광안리|광안)/i,
    name: "Gwangalli (광안리, Busan)",
    blurb:
      "A hip beach lined with cafés and bars facing the illuminated Gwangan Bridge — mellower than Haeundae, with weekend drone light-shows over the water.",
    spots: ["Gwangalli Beach & Gwangan Bridge view", "beachfront café-and-bar strip", "Millak Waterside Park", "weekend drone light show"],
    getThere: "Gwangan Stn (Busan Metro Line 2), Exit 3 or 5.",
    interests: { nightlife: "Sunset-to-late beach bars facing the lit bridge.", food: "Cafés, craft beer, and fresh seafood along the sand." },
  },
  {
    keys: /(nampo-?dong|nampo|jagalchi|자갈치|남포동|남포)/i,
    name: "Nampo-dong / Jagalchi (남포동, Busan)",
    blurb:
      "Busan's old downtown by the harbour — Korea's largest fish market, the BIFF cinema street, and the Gukje street market, all crowned by Yongdusan Park's tower.",
    spots: ["Jagalchi Fish Market (pick & eat upstairs)", "BIFF Square street food", "Gukje Market", "Busan Tower at Yongdusan Park"],
    getThere: "Jagalchi or Nampo Stn (Busan Metro Line 1).",
    interests: { food: "Pick live seafood at Jagalchi; BIFF Square ssiat-hotteok.", shopping: "Gukje Market's warren of stalls — clothes, gear, oddities." },
  },
  {
    keys: /(gamcheon|감천)/i,
    name: "Gamcheon Culture Village (감천문화마을, Busan)",
    blurb:
      "A pastel hillside of stacked houses and art-filled lanes, nicknamed Korea's Santorini. Photogenic murals and viewpoints — but a real residential village, so tread lightly.",
    spots: ["Little Prince viewpoint photo spot", "art murals & alley installations", "rooftop cafés with hillside views", "stamp-trail craft shops"],
    getThere: "Toseong Stn (Line 1) Exit 6, then the Saha-gu community bus up the hill.",
    interests: { history: "A 1950s refugee settlement reborn as an art village — go by day.", food: "Tiny view cafés and snack stalls along the lanes." },
  },

  // ── Jeju ─────────────────────────────────────────────────────────────────────
  {
    keys: /(jeju\s*city|jejusi|제주시|jeju|제주)/i,
    name: "Jeju City (제주시)",
    blurb:
      "The island's main gateway on the north coast — where the airport, ferries, and most nightlife are. A handy base for the eastern coast, markets, and black-pork restaurants.",
    spots: ["Dongmun Traditional Market", "Black Pork Street (heuk-dwaeji)", "Yongduam (Dragon Head) Rock", "Samyang black-sand beach"],
    getThere: "Jeju Int'l Airport (CJU); island buses and rental cars fan out from here.",
    interests: { food: "Jeju black pork BBQ and fresh galchi (cutlassfish).", nightlife: "Bars and night-market food around Dongmun & the city centre." },
  },
  {
    keys: /(seogwipo|서귀포)/i,
    name: "Seogwipo (서귀포)",
    blurb:
      "Jeju's sunnier south-coast town — waterfalls, dramatic sea cliffs, and the Olle coastal trails, plus the resort zone of Jungmun nearby. Warmer and more scenic than the north.",
    spots: ["Cheonjiyeon & Jeongbang waterfalls", "Jusangjeolli cliff columns", "Olle Trail coastal walks", "Jungmun resort beaches (nearby)"],
    getThere: "~1 hr by bus (600/Limousine or 281) from Jeju Airport, or rent a car.",
    interests: { food: "Seafood, hallabong-citrus treats, and harbour restaurants.", history: "Olle trails and waterfalls; whale/cliff scenery along the coast." },
  },

  // ── More Seoul (trendy & historic) ────────────────────────────────────────────
  {
    keys: /(yeonnam|연남)/i,
    name: "Yeonnam-dong (연남동)",
    blurb:
      "A laid-back café-and-bistro neighbourhood beside Hongdae, strung along the grassy 'Yeontral Park' rail trail — indie coffee shops, brunch, and a Chinatown-ish food street. Calmer and more local than Hongdae itself.",
    spots: ["Gyeongui Line Forest Park ('Yeontral Park')", "indie cafés & roasteries", "Yeonnam-dong Chinese-food street", "Dongjin Market"],
    getThere: "Hongik Univ. Stn (Line 2 / AREX) Exit 3, then a short walk.",
    interests: { food: "Specialty coffee, brunch, and hand-pulled noodles.", nightlife: "Low-key wine bars and izakayas, not clubs." },
  },
  {
    keys: /(apgujeong|cheongdam|압구정|청담)/i,
    name: "Apgujeong & Cheongdam (압구정·청담)",
    blurb:
      "Seoul's luxury quarter south of the river — flagship designer stores, K-pop entertainment HQs, high-end clinics, and the city's most exclusive dining. Polished and pricey.",
    spots: ["Apgujeong Rodeo Street", "Galleria Department Store", "Cheongdam luxury-brand row & K-pop agencies (SM, etc.)", "Dosan Park"],
    getThere: "Apgujeong Rodeo Stn (Suin-Bundang Line) or Apgujeong Stn (Line 3); Cheongdam Stn (Line 7).",
    interests: { shopping: "Designer flagships, Galleria, and Rodeo boutiques.", food: "Fine dining, omakase, and celebrity-chef restaurants — book ahead." },
  },
  {
    keys: /(jongno|jongro|gwanghwamun|종로|광화문)/i,
    name: "Jongno & Gwanghwamun (종로·광화문)",
    blurb:
      "Seoul's historic heart — the grand Gwanghwamun Square and palaces, old alley eateries (Pimatgol), and the Cheonggyecheon stream, all walkable. Where royal Korea meets the modern downtown.",
    spots: ["Gwanghwamun Square (King Sejong & Yi Sun-sin statues)", "Gyeongbokgung & Cheonggyecheon (both adjacent)", "Jogyesa Temple", "Gwangjang Market (nearby)"],
    getThere: "Gwanghwamun Stn (Line 5) or Jonggak / Jongno 3-ga (Lines 1/3/5).",
    interests: { history: "Palaces, Jogyesa, and the old Pimatgol back-alleys on foot.", food: "Historic gukbap, jokbal, and grilled-fish alleys around Jongno." },
  },
  {
    keys: /(hapjeong|mangwon|합정|망원)/i,
    name: "Hapjeong & Mangwon (합정·망원)",
    blurb:
      "A relaxed riverside pocket just west of Hongdae — the homely Mangwon Market, leafy Mangwon Hangang Park, and a thicket of cafés and small restaurants. Local-feeling and easy-going.",
    spots: ["Mangwon Traditional Market (cheap street food)", "Mangwon Hangang Park (riverside picnics)", "café & brunch lanes", "Mecenatpolis Mall (Hapjeong)"],
    getThere: "Hapjeong Stn (Lines 2/6) or Mangwon Stn (Line 6).",
    interests: { food: "Market street food and unpretentious neighbourhood eateries.", nightlife: "Cosy bars and riverside convenience-store beers." },
  },

  // ── East coast (popular KTX day-trip) ─────────────────────────────────────────
  {
    keys: /(gangneung|강릉)/i,
    name: "Gangneung (강릉)",
    blurb:
      "An east-coast beach-and-coffee town two hours from Seoul by KTX — wide sandy beaches, the famous Anmok 'coffee street', and pine-fringed shores. A favourite weekend escape.",
    spots: ["Anmok Beach Coffee Street", "Gyeongpo Beach & Lake", "Jeongdongjin (seaside railway)", "Ojukheon historic house"],
    getThere: "KTX from Seoul Stn or Cheongnyangni (~2 hr) to Gangneung Stn; local buses to the beaches.",
    interests: { food: "Fresh raw fish, sundubu (soft-tofu) at Chodang village, and seaside cafés.", history: "Ojukheon & Seongyojang — Joseon-era houses near the lake." },
  },

  // ── More Seoul (hanok-quiet & student-lively) ─────────────────────────────────
  {
    keys: /(seochon|서촌)/i,
    name: "Seochon (서촌)",
    blurb:
      "The quieter hanok quarter on the west side of Gyeongbokgung — old alleys, artist studios, galleries, and the traditional Tongin Market, with a calmer, more local feel than Bukchon across the palace.",
    spots: ["Tongin Market (the brass-coin lunchbox)", "Suseong-dong Valley walk", "art galleries & hanok cafés", "Gyeongbokgung & Gwanghwamun (adjacent)"],
    getThere: "Gyeongbokgung Stn (Line 3) Exit 2, then walk west.",
    interests: { history: "Hanok lanes, the palace wall, and old literati haunts on foot.", food: "Tongin Market's coin-lunchbox (yeopjeon dosirak) and cosy hanok cafés." },
  },
  {
    keys: /(konkuk|kondae|건대|건국대)/i,
    name: "Konkuk Univ. (건대)",
    blurb:
      "A high-energy student district around Konkuk University east of the river — the Common Ground container mall, a buzzing 'Rodeo' eating-and-bar street, and a lakeside park. Cheap, lively, and open late.",
    spots: ["Common Ground (shipping-container mall)", "Konkuk Rodeo eating & bar street", "Children's Grand Park (nearby)", "Ttukseom Hangang Park (nearby)"],
    getThere: "Konkuk Univ. Stn (Lines 2/7) — the heart of the area.",
    interests: { nightlife: "Student bars, pojangmacha, and clubs, busiest after 9pm.", food: "Cheap eats, lamb skewers (yangkkochi) street, and dessert cafés." },
  },
  {
    keys: /(sinchon|ewha|edae|신촌|이대|이화여대)/i,
    name: "Sinchon & Ewha (신촌·이대)",
    blurb:
      "A youthful university belt by Yonsei and Ewha — budget eats, karaoke, and the Ewha fashion-and-beauty shopping street, with the striking ECC glass-canyon campus you can walk into.",
    spots: ["Ewha shopping street (fashion & K-beauty)", "Ewha Campus Complex (ECC)", "Sinchon Yonsei-ro car-free street", "cheap eats & noraebang (karaoke)"],
    getThere: "Sinchon Stn (Line 2) or Ewha Womans Univ. Stn (Line 2).",
    interests: { shopping: "Budget fashion and cosmetics along the Ewha street.", food: "Student-priced eats, cafés, and late-night snacks." },
  },
  {
    keys: /(haebangchon|\bhbc\b|gyeongnidan|gyeongridan|해방촌|경리단길)/i,
    name: "Haebangchon & Gyeongnidan-gil (해방촌·경리단길)",
    blurb:
      "A hip hillside above Itaewon — craft-beer bars, rooftop cafés with Namsan views, and a global mix of small restaurants (Mexican, Middle Eastern, Korean-fusion). Artsy, walkable, and very foreigner-friendly.",
    spots: ["HBC craft-beer & wine bars", "Gyeongnidan-gil international restaurants", "rooftop cafés facing N Seoul Tower", "Sinheung Market stairs"],
    getThere: "Noksapyeong Stn (Line 6) Exit 2, then uphill; or a short walk from Itaewon.",
    interests: { food: "Global cuisines and brunch with English menus.", nightlife: "Craft-beer pubs and low-key rooftop bars." },
  },
  {
    keys: /(daehangno|daehakro|혜화|대학로)/i,
    name: "Daehangno (대학로)",
    blurb:
      "Seoul's live-theatre district around Hyehwa — hundreds of small playhouses, Marronnier Park street performances, and cheap student cafés and eats. Liveliest on weekend afternoons.",
    spots: ["Marronnier Park (buskers & street theatre)", "small live-theatre playhouses", "Naksan Park & Seoul City Wall (uphill)", "Ihwa Mural Village (nearby)"],
    getThere: "Hyehwa Stn (Line 4), Exit 1 or 2.",
    interests: { history: "Walk up to Naksan Park and the old city wall for sunset views.", food: "Student-budget eats, dessert cafés, and theatre-district bars." },
  },
  {
    keys: /(jeonju|전주)/i,
    name: "Jeonju Hanok Village (전주)",
    blurb:
      "Korea's largest hanok village and the home of bibimbap — 700+ traditional houses, hanji paper and craft workshops, and makgeolli alleys. A favourite slow-travel day or overnight from Seoul (~1.5–2 hr by KTX/bus).",
    spots: ["Jeonju Hanok Village lanes", "Gyeonggijeon Shrine", "Jaman Mural Village", "Pungnammun Gate & nambu night market"],
    getThere: "KTX or express bus to Jeonju (~1.5–2 hr from Seoul), then a local bus/taxi to the Hanok Village.",
    interests: { food: "Jeonju bibimbap, kongnamul-gukbap, and makgeolli alley spreads.", history: "Hanok lanes, Gyeonggijeon Shrine, and hanbok photo walks." },
  },
  {
    keys: /(gyeongju|경주)/i,
    name: "Gyeongju (경주)",
    blurb:
      "The 'museum without walls' — the thousand-year Silla capital, with grassy royal tombs, UNESCO temples, and a floodlit night pond, all on a small, bikeable scale. A history-lover's day or overnight (~2 hr by KTX from Seoul).",
    spots: ["Bulguksa Temple & Seokguram Grotto", "Daereungwon royal tombs (Cheonmachong)", "Cheomseongdae observatory", "Donggung Palace & Wolji Pond (night)"],
    getThere: "KTX to Singyeongju Stn (~2 hr from Seoul), then city bus/taxi; the central sites are close together.",
    interests: { history: "Silla tombs, Bulguksa, and the night-lit Wolji Pond.", food: "Hwangnam-bbang (red-bean pastry) and ssambap set meals." },
  },
  {
    keys: /(incheon|인천|songdo|송도)/i,
    name: "Incheon (인천 · Chinatown & Songdo)",
    blurb:
      "Korea's gateway port city by the airport — a historic Chinatown with jajangmyeon's birthplace and fairy-tale murals, plus the sleek, futuristic Songdo district with its waterfront park. An easy stop on the way in or out.",
    spots: ["Incheon Chinatown & Jjajangmyeon Museum", "Songwol-dong Fairy-Tale Village", "Songdo Central Park", "Wolmido seaside & ferries"],
    getThere: "Incheon Stn (Subway Line 1) for Chinatown; Incheon Line 1 to Central Park for Songdo; or AREX from the airport.",
    interests: { food: "Chinatown jjajangmyeon and mooncakes; Wolmido raw fish.", history: "Open Port-era streets, Chinatown, and the fairy-tale village." },
  },
  {
    keys: /(sokcho|속초)/i,
    name: "Sokcho (속초)",
    blurb:
      "An east-coast town that's the gateway to Seoraksan National Park — fresh seafood, a beach, and the boat-pulled Abai Village settled by North Korean refugees. Pairs mountains and sea in one trip (~2–2.5 hr bus from Seoul).",
    spots: ["Seoraksan National Park (cable car)", "Sokcho Tourist & Fish Market", "Abai Village (hand-pulled ferry)", "Sokcho Beach & Yeonggeumjeong sunrise pavilion"],
    getThere: "Express bus from Seoul (Express Bus Terminal / Dong Seoul, ~2–2.5 hr) to Sokcho terminal; local buses to Seorak.",
    interests: { food: "Abai sundae, dakgangjeong, and just-caught seafood at the market.", history: "Abai Village's refugee history and the coastal Yeonggeumjeong." },
  },
];

const INTERESTS = ["food", "shopping", "history", "nightlife"] as const;

/** Map a free-text interest (incl. synonyms) to one of our 4 buckets — so an enum
 *  miss like "drinks" or "eat" no longer leaks a raw -32602 (R7). Unknown values
 *  pass through and renderGuide acknowledges them gracefully. */
function normalizeInterest(raw?: string): string | undefined {
  const q = (raw ?? "").trim().toLowerCase();
  if (!q) return undefined;
  if (/food|eat|restaurant|dining|cuisine|맛집|먹/.test(q)) return "food";
  if (/shop|shopping|mall|buy|boutique|쇼핑/.test(q)) return "shopping";
  if (/history|historic|culture|tradition|heritage|역사|문화/.test(q)) return "history";
  if (/night|bar|club|drink|pub|booze|술|클럽/.test(q)) return "nightlife";
  return q;
}

/** The display name of a curated area if `text` is essentially *just* that area,
 *  else undefined. Used by getNowInfo to recognise a neighbourhood (no single
 *  "open" verdict) — but NOT a specific venue that merely contains an area name
 *  ("Bongchu Jjimdak Myeongdong" is a restaurant, not "Myeongdong"). */
export function matchAreaName(text: string): string | undefined {
  const t = (text ?? "").trim();
  if (!t) return undefined;
  for (const a of AREAS) {
    if (!a.keys.test(t)) continue;
    // Whatever's left after removing the area token (and generic area words) must
    // be trivial — otherwise it's a specific place, not a bare neighbourhood.
    const remainder = t
      .replace(a.keys, " ")
      .replace(/\b(area|district|neighbou?rhood|map|guide|동|구|역|station|stn)\b/gi, " ")
      .replace(/[^a-z0-9가-힣]/gi, "")
      .trim();
    if (remainder.length <= 2) return a.name;
  }
  return undefined;
}

function renderGuide(a: Area, interest?: string): string {
  const lines = [
    `🗺️ **${a.name}**`,
    "",
    a.blurb,
    "",
    "**Top spots**",
    ...a.spots.map((s) => `- ${s}`),
    "",
    `**Getting there:** ${a.getThere}`,
  ];
  if (interest) {
    const note = a.interests[interest as keyof Area["interests"]];
    if (note) {
      lines.push("", `**For ${interest}:** ${note}`);
    } else {
      // Acknowledge rather than silently dropping the interest the user asked for.
      const has = Object.keys(a.interests).join(", ");
      lines.push("", `_${a.name.split(" ")[0]} isn't especially known for **${interest}** — it's stronger for ${has || "general sightseeing"}._`);
    }
  }
  return lines.join("\n");
}

function renderUnknown(areaQuery: string): string {
  const known = AREAS.map((x) => x.name.split(" ")[0]).join(", ");
  return [
    `🗺️ **No hand-written guide for "${areaQuery}" yet**`,
    "",
    `I have curated guides for: ${known}.`,
    `Want one of those, or should I **search real places in ${areaQuery}** instead?`,
  ].join("\n");
}

// Footer for a matched guide — chips chain into the other tools for "here".
const CHOICES: Choice[] = [
  { emoji: "🧭", cmdEn: "Find foreigner essentials here", cmdKo: "근처 필수시설", descEn: "ATM, pharmacy, exchange" },
  { emoji: "🚇", cmdEn: "How do I get here?", cmdKo: "가는 길", descEn: "public-transit route" },
  { emoji: "🕒", cmdEn: "Is it good to go now?", descEn: "live hours + weather" },
  { emoji: "🌤️", cmdEn: "Weather & fine dust today", descEn: "forecast + air quality" },
];

/** Footer for a matched guide; foodies get a direct "eat here" chip (Y10). */
function guideChoices(areaShort: string, interest?: string): Choice[] {
  if (interest === "food") {
    return [
      { emoji: "🍽️", cmdEn: `Find foreigner-friendly places to eat in ${areaShort}`, descEn: "restaurants that take foreign cards" },
      { emoji: "🚇", cmdEn: "How do I get here?", cmdKo: "가는 길", descEn: "public-transit route" },
      { emoji: "🧭", cmdEn: "Find foreigner essentials here", descEn: "ATM, pharmacy, exchange" },
    ];
  }
  return CHOICES;
}

/** Footer when the area isn't in our curated set — steer to a real search of
 *  that same area instead of dead-end "here" chips. */
function unknownChoices(areaQuery: string): Choice[] {
  return [
    { emoji: "🔎", cmdEn: `Search real places in ${areaQuery}`, descEn: "live place search" },
    { emoji: "🧭", cmdEn: `Find foreigner essentials in ${areaQuery}`, descEn: "ATM, pharmacy, exchange" },
    { emoji: "🗺️", cmdEn: "Show me a curated area instead", descEn: "Myeongdong, Hongdae, Gangnam…" },
  ];
}

export const getAreaGuide: ToolDef = {
  name: "getAreaGuide",
  description:
    "Gives a concise English one-paragraph guide and top spots for a Korean neighborhood, tailored to foreign " +
    "visitors, with how-to-get-there and interest-based tips. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    area: z.string().describe("Neighborhood name, e.g. 'Myeongdong' or '성수동'."),
    interest: z
      .string()
      .optional()
      .describe(`Optional focus: ${INTERESTS.join(", ")} (synonyms like 'drinks' or 'eat' are understood).`),
  },
  annotations: {
    title: "Get Neighborhood Guide",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: (args) => {
    const area = String(args.area ?? "").trim();
    const interest = normalizeInterest(args.interest ? String(args.interest) : undefined);
    const a = AREAS.find((x) => x.keys.test(area));
    if (!a) return ok(renderUnknown(area), unknownChoices(area));
    return ok(renderGuide(a, interest), guideChoices(a.name.split(" ")[0], interest));
  },
};
