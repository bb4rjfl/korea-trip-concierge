import type { ToolDef } from "./types.js";
import { searchPlaceForeigner } from "./searchPlaceForeigner.js";
import { findForeignerFriendlyStore } from "./findForeignerFriendlyStore.js";
import { getTransitRoute } from "./getTransitRoute.js";
import { trackBusArrival } from "./trackBusArrival.js";
import { explainPayment } from "./explainPayment.js";
import { getAreaGuide } from "./getAreaGuide.js";
import { translateMenuContext } from "./translateMenuContext.js";
import { getNowInfo } from "./getNowInfo.js";

/** All registered tools (8 — within the recommended 3–10 range). */
export const ALL_TOOLS: ToolDef[] = [
  searchPlaceForeigner,
  findForeignerFriendlyStore,
  getTransitRoute,
  trackBusArrival,
  explainPayment,
  getAreaGuide,
  translateMenuContext,
  getNowInfo,
];

export const TOOL_NAMES = ALL_TOOLS.map((t) => t.name);
