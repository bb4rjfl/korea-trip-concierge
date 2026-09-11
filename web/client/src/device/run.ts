/**
 * Run a task the server handed over — on this phone, from this phone's fix.
 * Loaded only when a question is about "here", so the chat itself stays light.
 */

import type { DeviceTask } from "../../../../src/lib/deviceTask.js";
import type { Lang } from "./strings.js";
import type { DeviceCard, Fix } from "./card.js";
import { runNearby } from "./nearby.js";
import { runSights } from "./sights.js";
import { runRoute } from "./route.js";
import { runTrains } from "./trains.js";
import { runSight } from "./sight.js";

export type { DeviceCard, Fix };
export { pickedPlace, pickedTask } from "./followup.js";

export function runTask(task: DeviceTask, at: Fix, lang: Lang): Promise<DeviceCard> {
  switch (task.kind) {
    case "nearby":
      return runNearby(task, at, lang);
    case "sights":
      return runSights(task, at, lang);
    case "route":
      return runRoute(task, at, lang);
    case "trains":
      return runTrains(task, at, lang);
    case "sight":
      return runSight(task, at, lang);
  }
}
