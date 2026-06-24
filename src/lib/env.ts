/**
 * Centralized env access for external API keys. Keys live only in process env
 * (.env locally via loadEnv.ts, KC secrets in prod) — never in source,
 * responses, or logs. Reads `process.env` LAZILY (getters) so values set after
 * module load (e.g. by loadEnv) are always seen.
 */

export const ENV = {
  get PORT(): string {
    return process.env.PORT ?? "8080";
  },
  get BUS_API_KEY(): string {
    return process.env.BUS_API_KEY ?? "";
  },
  get TOUR_API_KEY(): string {
    return process.env.TOUR_API_KEY ?? "";
  },
  get TRANSIT_API_KEY(): string {
    return process.env.TRANSIT_API_KEY ?? "";
  },
  get SUBWAY_API_KEY(): string {
    return process.env.SUBWAY_API_KEY ?? "";
  },
  get JEJU_API_KEY(): string {
    return process.env.JEJU_API_KEY ?? "";
  },
  get KAKAO_REST_API_KEY(): string {
    return process.env.KAKAO_REST_API_KEY ?? "";
  },
};

export type ApiKeyName =
  | "BUS_API_KEY"
  | "TOUR_API_KEY"
  | "TRANSIT_API_KEY"
  | "SUBWAY_API_KEY"
  | "JEJU_API_KEY"
  | "KAKAO_REST_API_KEY";

export function hasKey(name: ApiKeyName): boolean {
  return ENV[name].trim().length > 0;
}
