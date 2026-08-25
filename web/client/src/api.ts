/** Thin client for the stateless chat API. */

export type Lang = "en" | "ja" | "zh" | "ko";

export interface Chip {
  emoji: string;
  cmdEn: string;
  cmdKo?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PlaceImage {
  title: string;
  image: string;
}

export interface ChatApiResponse {
  reply?: string;
  toolMarkdown?: string;
  images?: PlaceImage[];
  chips: Chip[];
  meta: { tool?: string; lang: Lang; engine: string; ms: number };
}

export type StatusEvent = { stage: "routing" } | { stage: "tool"; tool: string } | { stage: "localizing" };

/**
 * Chat over SSE: live stage events drive the typing indicator, the final
 * `result` frame carries the same payload as the plain JSON API. Falls back
 * transparently to JSON when the server doesn't stream.
 */
export async function sendChat(
  messages: ChatTurn[],
  uiLang: Lang,
  onStatus?: (e: StatusEvent) => void,
): Promise<ChatApiResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ messages: messages.slice(-12), uiLang }),
      signal: controller.signal,
    });
    if (res.status === 429) throw new Error("rate_limited");
    if (!res.ok) throw new Error(`http_${res.status}`);

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/event-stream") || !res.body) {
      return (await res.json()) as ChatApiResponse;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let result: ChatApiResponse | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const event = /^event: (.+)$/m.exec(frame)?.[1];
        const data = /^data: (.+)$/m.exec(frame)?.[1];
        if (!event || !data) continue;
        try {
          const parsed = JSON.parse(data) as unknown;
          if (event === "status") onStatus?.(parsed as StatusEvent);
          else if (event === "result") result = parsed as ChatApiResponse;
        } catch {
          /* skip malformed frame */
        }
      }
    }
    if (!result) throw new Error("stream_no_result");
    return result;
  } finally {
    clearTimeout(timer);
  }
}
