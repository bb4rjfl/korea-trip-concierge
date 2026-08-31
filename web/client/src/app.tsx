import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { sendChat, type ChatTurn, type Chip, type Lang, type PlaceImage, type StatusEvent } from "./api.js";
import { STRINGS, SCENARIOS, SOURCE_CREDITS, TOOL_EMOJI, detectDefaultLang, type Scenario } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";
import { nearestPlace } from "./geo.js";

interface Msg {
  role: "user" | "assistant";
  content: string;
  /** Assistant messages carry chips + whether content is tool Markdown. */
  chips?: Chip[];
  images?: PlaceImage[];
  isMarkdown?: boolean;
  isError?: boolean;
}

const STORE_KEY = "ktc.msgs.v1";
const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "EN" },
  { value: "ko", label: "한국어" },
  { value: "ja", label: "日本語" },
  { value: "zh", label: "中文" },
];

function loadMsgs(): Msg[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return Array.isArray(parsed) ? parsed.slice(-60) : [];
  } catch {
    return [];
  }
}

export function App() {
  const [lang, setLang] = useState<Lang>(detectDefaultLang());
  const [msgs, setMsgs] = useState<Msg[]>(loadMsgs());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  // A card that is readable while its translation is still being fetched. Shown in
  // place of the typing dots so a Korean or Japanese user isn't left waiting on a
  // translation for an answer that already exists.
  const [draft, setDraft] = useState<{ toolMarkdown: string; chips: Chip[] } | null>(null);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const t = STRINGS[lang];

  useEffect(() => {
    const up = (): void => setOnline(true);
    const down = (): void => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("ktc.lang", lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
  }, [lang]);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-60)));
    } catch {
      /* storage full — non-fatal */
    }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, busy, statusText]);

  const history: ChatTurn[] = useMemo(
    () => msgs.map((m) => ({ role: m.role, content: m.content })),
    [msgs],
  );

  function statusLabel(e: StatusEvent): string {
    if (e.stage === "routing") return t.statusRouting;
    if (e.stage === "localizing") return t.statusLocalizing;
    const emoji = TOOL_EMOJI[e.tool] ?? "🔎";
    return `${emoji} ${t.statusTool}`;
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setNotice(null);
    const nextMsgs: Msg[] = [...msgs, { role: "user" as const, content: trimmed }];
    setMsgs(nextMsgs);
    setBusy(true);
    setStatusText(null);
    setDraft(null);
    try {
      const res = await sendChat(
        [...history, { role: "user", content: trimmed }],
        lang,
        (e) => setStatusText(statusLabel(e)),
        (d) => setDraft(d),
      );
      const content = res.toolMarkdown ?? res.reply ?? "";
      setMsgs([
        ...nextMsgs,
        {
          role: "assistant",
          content,
          chips: res.chips ?? [],
          images: res.images,
          isMarkdown: Boolean(res.toolMarkdown),
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error && err.message === "rate_limited" ? t.rateLimited : t.networkError;
      setMsgs([...nextMsgs, { role: "assistant", content: msg, isError: true, chips: [] }]);
    } finally {
      setBusy(false);
      setStatusText(null);
      setDraft(null);
    }
  }

  function chipText(c: Chip): string {
    return lang === "ko" && c.cmdKo ? c.cmdKo : c.cmdEn;
  }

  function newChat() {
    setMsgs([]);
    localStorage.removeItem(STORE_KEY);
  }

  function retryLast() {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    // Drop the trailing error bubble + its user message, then resend.
    setMsgs(msgs.slice(0, msgs.lastIndexOf(lastUser)));
    void send(lastUser.content);
  }

  function nearMe() {
    if (busy) return;
    if (!("geolocation" in navigator)) {
      setNotice(t.locationDenied);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const hit = nearestPlace(pos.coords.latitude, pos.coords.longitude);
        if (!hit) {
          setNotice(t.locationDenied);
          return;
        }
        setNotice(t.locationPrivacy);
        void send(t.nearMeQuery.replace("{place}", hit.label));
      },
      () => setNotice(t.locationDenied),
      { timeout: 8000, maximumAge: 120_000 },
    );
  }

  const lastAssistantIdx = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "assistant") return i;
    return -1;
  })();

  return (
    <div class="shell">
      <header class="hdr">
        <div class="hdr-brand">
          <img class="hdr-logo" src="/logo.png" alt="" width="36" height="36" />
          <div>
            <h1>Korea Trip Concierge</h1>
            <p class="hdr-tag">{t.tagline}</p>
          </div>
        </div>
        <div class="hdr-actions">
          <select
            class="lang-sel"
            aria-label="Language"
            value={lang}
            onChange={(e) => setLang((e.target as HTMLSelectElement).value as Lang)}
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          {msgs.length > 0 && (
            <button class="ghost-btn" onClick={newChat} title={t.newChat} aria-label={t.newChat}>
              ↺
            </button>
          )}
        </div>
      </header>

      <div class="chat" ref={scrollRef}>
        <div class="chat-inner" aria-live="polite">
          <div class="bubble assistant">
            <div class="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(t.welcome) }} />
          </div>

          {msgs.length === 0 && (
            <section class="scenarios" aria-label={t.scenariosTitle}>
              <p class="scenarios-title">{t.scenariosTitle}</p>
              <div class="scenario-grid">
                {SCENARIOS[lang].map((s: Scenario) => (
                  <button key={s.send} class="scenario-card" onClick={() => void send(s.send)}>
                    <span class="scenario-emoji" aria-hidden="true">{s.emoji}</span>
                    <span class="scenario-label">{s.label}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {msgs.map((m, i) => (
            <div key={i} class={`bubble ${m.role}${m.isError ? " error" : ""}`}>
              {m.role === "assistant" && (m.images?.length ?? 0) > 0 && (
                <div class="photos">
                  {m.images!.map((img) => (
                    <figure key={img.image} class="photo-card">
                      <img
                        src={img.image}
                        alt={img.title}
                        referrerpolicy="no-referrer"
                        onError={(e) => {
                          const fig = (e.target as HTMLElement).closest("figure");
                          if (fig) fig.style.display = "none";
                        }}
                      />
                      <figcaption>{img.title}</figcaption>
                    </figure>
                  ))}
                  <span class="photo-credit">{t.photoCredit}</span>
                </div>
              )}
              {m.role === "assistant" && m.isMarkdown ? (
                <div class="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
              ) : (
                <div class="plain-body">{m.content}</div>
              )}
              {m.role === "assistant" && m.isError && i === msgs.length - 1 && (
                <div class="chips">
                  <button class="chip" onClick={retryLast}>🔄 {t.retry}</button>
                </div>
              )}
              {m.role === "assistant" && i === lastAssistantIdx && !busy && (m.chips?.length ?? 0) > 0 && (
                <div class="chips" role="group" aria-label="Suggested next questions">
                  {m.chips!.map((c) => (
                    <button key={c.cmdEn} class="chip" onClick={() => void send(chipText(c))}>
                      <span aria-hidden="true">{c.emoji}</span> {chipText(c)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {busy && draft && (
            <div class="bubble assistant">
              <div class="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(draft.toolMarkdown) }} />
              <p class="draft-note">
                <span class="dot" /><span class="dot" /><span class="dot" /> {t.statusLocalizing}
              </p>
            </div>
          )}

          {busy && !draft && (
            <div class="bubble assistant typing" aria-label={statusText ?? t.thinking}>
              <span class="dot" /><span class="dot" /><span class="dot" />
              <span class="typing-label">{statusText ?? t.thinking}</span>
            </div>
          )}
        </div>
      </div>

      <footer class="composer-wrap">
        {!online && <p class="notice offline-note">📡 {t.offline}</p>}
        {notice && <p class="notice">{notice}</p>}
        <form
          class="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <button class="near-btn" type="button" onClick={nearMe} title={t.nearMe} aria-label={t.nearMe} disabled={busy}>
            📍
          </button>
          <input
            class="composer-input"
            type="text"
            value={input}
            placeholder={t.placeholder}
            enterkeyhint="send"
            maxLength={500}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          />
          <button class="send-btn" type="submit" disabled={busy || !input.trim()} aria-label={t.send}>
            ➤
          </button>
        </form>
        <button class="attribution" onClick={() => setAboutOpen(true)}>
          {t.attribution} <span class="info-i">ⓘ</span>
        </button>
      </footer>

      {aboutOpen && (
        <div class="modal-backdrop" onClick={() => setAboutOpen(false)}>
          <div class="modal" role="dialog" aria-modal="true" aria-label={t.aboutTitle} onClick={(e) => e.stopPropagation()}>
            <h2>{t.aboutTitle}</h2>
            <p>{t.aboutBody}</p>
            <h3>{t.aboutSources}</h3>
            <ul>
              {SOURCE_CREDITS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <button class="modal-close" onClick={() => setAboutOpen(false)}>
              {t.close}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
