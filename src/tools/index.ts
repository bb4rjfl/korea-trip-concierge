import type { ToolDef } from "./types.js";
import { searchPlaceForeigner } from "./searchPlaceForeigner.js";
import { findForeignerFriendlyStore } from "./findForeignerFriendlyStore.js";
import { getTransitRoute } from "./getTransitRoute.js";
import { trackBusArrival } from "./trackBusArrival.js";
import { explainPayment } from "./explainPayment.js";
import { getAreaGuide } from "./getAreaGuide.js";
import { translateMenuContext } from "./translateMenuContext.js";
import { getNowInfo } from "./getNowInfo.js";
import { getJejuInfo } from "./getJejuInfo.js";
import { getWeatherAndAir } from "./getWeatherAndAir.js";
import { trackSubwayArrival } from "./trackSubwayArrival.js";

/** All registered tools (max 20 per Kakao policy). */
export const ALL_TOOLS: ToolDef[] = [
  searchPlaceForeigner,
  findForeignerFriendlyStore,
  getTransitRoute,
  trackBusArrival,
  trackSubwayArrival,
  explainPayment,
  getAreaGuide,
  translateMenuContext,
  getNowInfo,
  getJejuInfo,
  getWeatherAndAir,
];

export const TOOL_NAMES = ALL_TOOLS.map((t) => t.name);
