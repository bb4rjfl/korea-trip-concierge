import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { resolveCity, getWeather, getAir, getWeatherAlerts } from "../lib/sources/weatherair.js";
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
    // allSettled, not all: the three sources fail independently (e.g. KMA hits its
    // daily quota / 429 while AirKorea is fine) — show whatever we did get rather
    // than throwing the whole response away.
    const [wRes, aRes, alertRes] = await Promise.allSettled([getWeather(city), getAir(city), getWeatherAlerts()]);
    const weather = wRes.status === "fulfilled" ? wRes.value : undefined;
    const air = aRes.status === "fulfilled" ? aRes.value : undefined;
    const alerts = alertRes.status === "fulfilled" ? alertRes.value : [];

    // Both sources down → honest failure with retry.
    if (!weather && !air) {
      return fail(
        "Couldn't reach the weather/air service",
        "Both the forecast and air-quality sources didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }

    const lines = [`🌤️ **${city.label} — weather & air**`, ""];

    // Safety first: surface any active nationwide weather warnings (typhoon, etc.).
    if (alerts.length) {
      lines.push(`🚨 **Weather warnings in effect:** ${alerts.join(", ")} _(nationwide — check your local area)_`, "");
    }

    const w: string[] = [];
    if (weather?.tempC != null) w.push(`🌡️ ${weather.tempC}°C`);
    if (weather?.sky) w.push(weather.sky);
    if (weather?.precip) w.push(`☔ ${weather.precip}`);
    if (weather?.rainProb != null) w.push(`rain ${weather.rainProb}%`);
    lines.push(w.length ? w.join(" · ") : "🌡️ _Forecast unavailable right now (try again shortly)._");

    lines.push("");
    const pm: string[] = [];
    if (air?.pm10 != null) pm.push(`PM10 ${air.pm10}`);
    if (air?.pm25 != null) pm.push(`PM2.5 ${air.pm25}`);
    if (air && pm.length) {
      lines.push(`😷 Air quality: **${air.grade}** (${pm.join(", ")} ㎍/㎥)`);
      lines.push(air.advisory);
      if (air.dataTime) lines.push(`\n_Air measured ${air.dataTime} (KST), ${air.stations} stations._`);
    } else {
      lines.push("😷 Air quality: _data unavailable right now._");
    }

    return ok(lines.join("\n"), CHOICES);
  },
};
