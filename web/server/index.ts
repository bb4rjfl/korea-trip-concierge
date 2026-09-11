import "../../src/lib/loadEnv.js"; // MUST be first: populate process.env from .env
import path from "node:path";
import { existsSync } from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import { ENV, hasKey } from "../../src/lib/env.js";
import { warmUpSources, warmCoursePool, warmCorpus } from "../../src/lib/warmup.js";
import { corpusSize, corpusEmbedded } from "../../src/lib/retrieval.js";
import { trippedHosts } from "../../src/lib/http.js";
import { sightsFile, warmSightsIndex } from "../../src/lib/sources/sightsIndex.js";
import { trainBoard } from "../../src/lib/sources/trainBoard.js";
import { normalizeLang, getPlaceDetail } from "../../src/lib/sources/tourapi.js";
import { warmCityList } from "../../src/lib/sources/tago.js";
import { CATALOG } from "./catalog.js";
import { handleChat, type ChatRequest } from "./orchestrator.js";
import { llmEnabled } from "./llm.js";

/**
 * Korea Trip Concierge — web chat server (tourism-data contest track).
 * Serves the SPA + a stateless /api/chat that runs the 13 tools in-process.
 * No login, no session, no PII: the client keeps its own history.
 */

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));

/* ------------------------------- rate limiting ------------------------------ */
// Small in-memory token bucket per IP: protects upstream API keys and the LLM
// quota from abuse; sized generously above any human chat cadence.
// Configurable so a QA sweep can be raised temporarily without a code change.
// Korean mobile carriers and hotel wifi put many phones behind one public IP, so
// a per-IP budget sized for one person throttles a whole floor of a guesthouse.
// A human sends four or five messages a minute; this leaves room for a dozen of
// them while still capping a script.
const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 60) || 60;
const BUCKET_CAPACITY = RATE_PER_MIN; // burst
const REFILL_PER_MS = RATE_PER_MIN / 60_000;
const buckets = new Map<string, { tokens: number; ts: number }>();

function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: BUCKET_CAPACITY, ts: now };
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + (now - b.ts) * REFILL_PER_MS);
  b.ts = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    res.status(429).json({ error: "rate_limited", retryAfterSec: 10 });
    return;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  next();
}

// Periodic sweep so the bucket map can't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000;
  for (const [ip, b] of buckets) if (b.ts < cutoff) buckets.delete(ip);
}, 60_000).unref();

/* ----------------------------------- api ------------------------------------ */

app.post("/api/chat", rateLimit, async (req: Request, res: Response) => {
  const body = req.body as Partial<ChatRequest> | undefined;
  if (!body || !Array.isArray(body.messages) || body.messages.length > 60) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  const messages = body.messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  // Only the conversation and the language are read from the body. Where the
  // traveller is never comes here — the phone answers "near me" on its own
  // (src/lib/deviceTask.ts) — and anything else in the body is ignored, unread.

  const logMeta = (r: Awaited<ReturnType<typeof handleChat>>): void => {
    // Ops log: tool + timing + engine only — never message text (no PII).
    console.log(`[chat] ${r.meta.engine} tool=${r.meta.tool ?? "-"} lang=${r.meta.lang} ${r.meta.ms}ms`);
  };

  // SSE mode: live stage events (routing → tool → localizing) then the result.
  if ((req.headers.accept ?? "").includes("text/event-stream")) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
      const response = await handleChat(
        { messages, uiLang: body.uiLang },
        (e) => send("status", e),
        (d) => send("draft", d),
      );
      send("result", response);
      logMeta(response);
    } catch (err) {
      console.error("[chat] sse error:", err);
      send("result", { chips: [], meta: { lang: body.uiLang ?? "en", engine: "none", ms: 0 } });
    }
    res.end();
    return;
  }

  const response = await handleChat({ messages, uiLang: body.uiLang });
  logMeta(response);
  res.json(response);
});

/* ------------------------ the same copy for everyone ------------------------- */
// What the phone needs to answer "near me" by itself. Each is one file that
// every visitor gets, identical whoever asks and from wherever, so asking for
// it says nothing about where anyone is.

/** Gzip when the browser takes it — these are the two biggest things we send. */
function sendJson(req: Request, res: Response, b: { json: Buffer; gzip: Buffer }, cache: string): void {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", cache);
  res.setHeader("Vary", "Accept-Encoding");
  if (/\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""))) {
    res.setHeader("Content-Encoding", "gzip");
    res.end(b.gzip);
  } else {
    res.end(b.json);
  }
}

// Every train approaching every Seoul station: the phone reads its own station off it.
app.get("/api/trains", rateLimit, async (req: Request, res: Response) => {
  const b = await trainBoard().catch(() => undefined);
  if (!b) {
    res.status(503).json({ error: "unavailable" });
    return;
  }
  sendJson(req, res, b, "no-cache");
});

// The tourism board's sights for one language: the phone measures which are near it.
app.get("/api/sights/:lang", rateLimit, async (req: Request, res: Response) => {
  const lang = normalizeLang(String(req.params.lang ?? ""));
  const b = await sightsFile(lang).catch(() => undefined);
  if (!b) {
    res.status(503).json({ error: "unavailable" });
    return;
  }
  res.setHeader("ETag", b.etag);
  if (req.headers["if-none-match"] === b.etag) {
    res.status(304).end();
    return;
  }
  sendJson(req, res, b, "public, max-age=1800");
});

// One sight in full — for the phone's "tell me about this one" on a sight it
// listed. What is asked for is a place the traveller chose, by its id, the same
// as typing its name; nothing about where they are comes with it.
app.get("/api/sight/:lang/:id", rateLimit, async (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");
  const type = String(req.query.type ?? "");
  if (!/^\d{1,10}$/.test(id) || (type && !/^\d{1,3}$/.test(type))) {
    res.status(400).json({ error: "bad_request" });
    return;
  }
  const detail = await getPlaceDetail(id, normalizeLang(String(req.params.lang ?? "")), type || undefined).catch(() => undefined);
  if (!detail) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=1800");
  res.json(detail);
});

// The Kakao Maps JavaScript key, for the phone's own nearby searches. Public by
// design: Kakao only honours it from the domains registered for it.
app.get("/api/client-config", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json({ kakaoJsKey: (process.env.KAKAO_JS_KEY ?? "").trim() });
});

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    name: "korea-trip-concierge-web",
    build: ENV.GIT_SHA.slice(0, 7),
    // Semantic search is the difference between answering "somewhere quiet"
    // and not, and it is unavailable for a moment after a cold start. Say so,
    // so a deploy can be checked rather than assumed.
    search: { docs: corpusSize(), semantic: corpusEmbedded() },
    // Which upstreams we are currently skipping, so an outage is visible
    // here instead of being inferred from slow answers.
    ...(trippedHosts().length ? { degraded: trippedHosts() } : {}),
    status: "ok",
    tools: CATALOG.length,
    llm: llmEnabled(),
    sources: {
      tour: hasKey("TOUR_API_KEY"),
      bus: hasKey("BUS_API_KEY"),
      transit: hasKey("TRANSIT_API_KEY"),
      subway: hasKey("SUBWAY_API_KEY"),
      jeju: hasKey("JEJU_API_KEY"),
      naver: hasKey("NAVER_CLIENT_ID") && hasKey("NAVER_CLIENT_SECRET"),
      foursquare: hasKey("FOURSQUARE_API_KEY"),
      visitseoul: hasKey("VISITSEOUL_API_KEY"),
    },
  });
});

// Same ops diagnostic as the MCP server: ODsay allowlists egress IPs.
app.get("/egress-ip", async (_req: Request, res: Response) => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const r = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(timer);
    const j = (await r.json()) as { ip?: string };
    res.json({ egressIp: j.ip ?? "unknown", note: "register on lab.odsay.com if changed" });
  } catch {
    res.status(502).json({ egressIp: "lookup failed", note: "external IP service unreachable" });
  }
});

/* ------------------------------ static frontend ----------------------------- */

// cwd is the project root in every run mode (tsx dev, node dist-web, Docker).
const CLIENT_DIST = path.resolve(process.cwd(), "web/client/dist");
const hasClient = existsSync(path.join(CLIENT_DIST, "index.html"));
if (hasClient) {
  app.use(
    express.static(CLIENT_DIST, {
      maxAge: "1h",
      index: "index.html",
      setHeaders: (res, filePath) => {
        // A cached service worker pins the app at the version that installed it,
        // so this one file has to be re-fetched every time.
        if (filePath.endsWith("sw.js")) res.setHeader("Cache-Control", "no-cache");
        // Hashed build assets are immutable by construction.
        else if (/[/\\]assets[/\\]/.test(filePath)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    }),
  );
  // SPA fallback for GET html navigations that didn't match a file or /api.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && (req.headers.accept ?? "").includes("text/html")) {
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
      return;
    }
    next();
  });
} else {
  app.get("/", (_req: Request, res: Response) => {
    res
      .status(200)
      .type("text/plain")
      .send("korea-trip-concierge-web API is up. Client bundle not built yet (npm run build:web).");
  });
}

/* ---------------------------------- start ----------------------------------- */

const port = Number(process.env.WEB_PORT ?? 8790);
app.listen(port, () => {
  console.log(`[web] korea-trip-concierge-web listening on :${port} (llm=${llmEnabled() ? "on" : "off"}, client=${hasClient ? "dist" : "none"})`);
  try {
    warmCityList();
    warmUpSources();
    warmCorpus();
    warmCoursePool();
    // After the rest has settled: a few dozen tourism-API pages, once a day.
    setTimeout(() => void warmSightsIndex(), 20_000).unref();
  } catch {
    /* best-effort warmup */
  }
});
