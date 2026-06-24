/**
 * Centralized env access for external API keys. Keys live only in process env
 * (.env locally, KC secrets in prod) — never in source, responses, or logs.
 * Tools call `requireKey()`; when a key is missing they degrade gracefully to a
 * "data source not yet connected" message instead of crashing.
 */

export const ENV = {
  PORT: process.env.PORT ?? "8080",
  BUS_API_KEY: process.env.BUS_API_KEY ?? "",
  TOUR_API_KEY: process.env.TOUR_API_KEY ?? "",
  TRANSIT_API_KEY: process.env.TRANSIT_API_KEY ?? "",
} as const;

export type ApiKeyName = "BUS_API_KEY" | "TOUR_API_KEY" | "TRANSIT_API_KEY";

export function hasKey(name: ApiKeyName): boolean {
  return ENV[name].trim().length > 0;
}
