import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { resolveCity, getWeather, getAir } from "../lib/sources/weatherair.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * getWeatherAndAir — current forecast + fine-dust (PM10/PM2.5) for a Korean city,
 * from KMA short-term forecast and AirKorea (src/lib/sources/weatherair.ts).
 * Fine dust strongly affects day plans for visitors, and this is live, structured
 * data a plain LLM can't fetch.
 */

const CHOICES: Choice[] = [
  { emoji: "🧴", cmdEn: "What should I wear today?", descEn: "clothing tips for this weather" },
  { emoji: "🏛️", cmdEn: "Good indoor places if air is bad", descEn: "museums, malls, cafes" },
  { emoji: "🗺️", cmdEn: "Plan a route", descEn: "public-transit directions" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry" },
  { emoji: "🗺️", cmdEn: "Guide me around the area", descEn: "neighborhood overview" },
];

export const getWeatherAndAir: ToolDef = {
  name: "getWeatherAndAir",
  description:
    "Gives a foreign visitor the current weather forecast and fine-dust (PM10/PM2.5) air quality for a Korean " +
    "city, with a plain-English advisory (e.g. whether to wear a mask). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    city: z
      .string()
      .optional()
      .describe("Korean city, e.g. 'Seoul', 'Busan', 'Jeju'. Defaults to Seoul."),
  },
  annotations: {
    title: "Weather & Air Quality",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false, // changes with time
    openWorldHint: true,
  },
  handler: async (args) => {
    const cityArg = args.city ? String(args.city) : undefined;

    if (!hasKey("BUS_API_KEY")) {
      return notConnected(
        "Weather & Air Quality",
        `Sources: **KMA forecast** + **AirKorea fine dust**. City: **${cityArg ?? "Seoul"}**.`,
        CHOICES,
      );
    }

    const city = resolveCity(cityArg);
    try {
      const [weather, air] = await Promise.all([getWeather(city), getAir(city)]);
      const lines = [`🌤️ **${city.label} — weather & air**`, ""];

      const w: string[] = [];
      if (weather.tempC != null) w.push(`🌡️ ${weather.tempC}°C`);
      if (weather.sky) w.push(weather.sky);
      if (weather.precip) w.push(`☔ ${weather.precip}`);
      if (weather.rainProb != null) w.push(`rain ${weather.rainProb}%`);
      lines.push(w.length ? w.join(" · ") : "_Forecast unavailable right now._");

      lines.push("");
      const pm: string[] = [];
      if (air.pm10 != null) pm.push(`PM10 ${air.pm10}`);
      if (air.pm25 != null) pm.push(`PM2.5 ${air.pm25}`);
      if (pm.length) {
        lines.push(`😷 Air quality: **${air.grade}** (${pm.join(", ")} ㎍/㎥)`);
        lines.push(air.advisory);
      } else {
        lines.push("😷 Air quality: _data unavailable right now._");
      }
      if (air.dataTime) lines.push(`\n_Air measured ${air.dataTime} (KST), ${air.stations} stations._`);

      return ok(lines.join("\n"), CHOICES);
    } catch {
      return fail(
        "Couldn't reach the weather/air service",
        "The weather or air-quality source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
