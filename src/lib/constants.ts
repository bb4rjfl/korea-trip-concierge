/**
 * Project-wide constants. Single source for the service name so every tool
 * description includes it (Kakao rule: description must contain the service name).
 */

/** MCP server name. MUST NOT contain "kakao" (Kakao naming rule). */
export const SERVER_NAME = "korea-trip-concierge";

export const SERVER_VERSION = "0.1.0";

/** Service display name, embedded in every tool description (Korean rule §3-2). */
export const SERVICE_NAME = "Korea Trip Concierge(코리아 트립 컨시어지)";

/**
 * Hard ceiling on response size. Kakao rejects responses over 24k.
 * We guard well under it to leave headroom for transport overhead.
 */
export const MAX_RESPONSE_CHARS = 24_000;
export const RESPONSE_BUDGET_CHARS = 23_000; // soft budget; truncate body before footer

/** External API timeout (ms). p99 must stay under 3,000ms — keep calls short. */
export const EXTERNAL_API_TIMEOUT_MS = 2_500;

/** Default cache TTL for external data (ms). Realtime tools use shorter TTLs. */
export const DEFAULT_CACHE_TTL_MS = 60_000;
