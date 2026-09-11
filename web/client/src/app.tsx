import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { sendChat, type ChatTurn, type Chip, type Here, type Lang, type PlaceImage, type StatusEvent } from "./api.js";
import { STRINGS, SCENARIOS, SOURCE_CREDITS, TOOL_EMOJI, detectDefaultLang, type Scenario } from "./i18n.js";
import { renderMarkdown } from "./markdown.js";
import { asksNearMe, asksFromHere } from "../../../src/lib/here.js";
import { Mascot, mascotEnabled, MASCOT_CREDIT } from "./mascot.js";
import { Haru, HARU_CREDIT } from "./haru.js";

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
/** Whether the traveller has chosen to answer from their location — the choice, never the position. */
const SHARE_KEY = "ktc.here";

/** "±15 m", "±1.2 km". */
function formatMetres(m: number): string {
  return m < 1000 ? `${Math.max(5, Math.round(m / 5) * 5)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** A pin at the exact spot, opened in Kakao Map — "where does it think I am?" answered at a glance. */
function pinLink(h: Here): string {
  return `https://map.kakao.com/link/map/${encodeURIComponent("📍")},${h.lat},${h.lng}`;
}
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
  // Location, the way a map app has it: once the traveller allows it, every
  // question is answered from where they are — until they switch it off. The
  // choice is remembered on this device; the position itself is fetched fresh.
  const [sharing, setSharing] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SHARE_KEY) === "on";
    } catch {
      return false;
    }
  });
  const [fix, setFix] = useState<(Here & { at: number }) | null>(null);
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

  /** A fix this recent is still where they are; a walking traveller moves ~40 m a half-minute. */
  const FIX_FRESH_MS = 30_000;
  /** Beyond this the phone does not really know — a desktop guessing from its IP address. */
  const USABLE_ACCURACY_M = 1500;

  /**
   * The phone's position, asking permission the first time.
   *
   * High-accuracy mode, because the answer is "which pharmacy is 140 m away",
   * and the network-only estimate a phone gives by default can be off by a
   * kilometre — enough to put the traveller in the next neighbourhood.
   */
  async function getFix(): Promise<(Here & { at: number }) | null> {
    if (!("geolocation" in navigator)) return null;
    if (fix && Date.now() - fix.at < FIX_FRESH_MS) return fix;
    const pos = await new Promise<GeolocationPosition | null>((resolve) =>
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: FIX_FRESH_MS,
      }),
    );
    if (!pos) return null;
    const next = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: Math.round(pos.coords.accuracy),
      at: Date.now(),
    };
    setFix(next);
    // Allowed once, used from then on — the way a map app behaves — with the
    // switch in plain sight above the input.
    if (!sharing) {
      setSharing(true);
      try {
        localStorage.setItem(SHARE_KEY, "on");
      } catch {
        /* private mode — sharing lasts this visit */
      }
    }
    return next;
  }

  /** A fix good enough to answer "near me" from, or nothing. */
  const usable = (f: Here | null): Here | undefined =>
    f && (f.accuracy ?? 0) <= USABLE_ACCURACY_M ? { lat: f.lat, lng: f.lng, accuracy: f.accuracy } : undefined;

  /** Why we could not use the position, when we could not. */
  function whyNot(f: Here | null): string {
    if (!f) return t.locationNeedsTyping;
    return t.locationImprecise.replace("{accuracy}", formatMetres(f.accuracy ?? 0));
  }

  /** Get the position, showing that we are doing so. */
  async function lookUp(): Promise<(Here & { at: number }) | null> {
    setBusy(true);
    setStatusText(t.findingYou);
    try {
      return await getFix();
    } finally {
      setBusy(false);
      setStatusText(null);
    }
  }

  function stopSharing() {
    setSharing(false);
    setFix(null);
    try {
      localStorage.setItem(SHARE_KEY, "off");
    } catch {
      /* nothing to forget */
    }
  }

  /**
   * Send what the traveller typed, from where they are when that matters.
   *
   * With location on, every question carries the position — so "how do I get
   * to Myeongdong" starts from them without asking. With it off, a question that
   * is about "here" ("where is the nearest pharmacy", "내 주변 맛집") asks the
   * phone first, which is the moment the browser asks permission.
   */
  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const aboutHere = asksNearMe(trimmed) || asksFromHere(trimmed);
    if (!sharing && !aboutHere) return send(trimmed);
    setInput("");
    const f = aboutHere ? await lookUp() : await getFix();
    const here = usable(f);
    await send(trimmed, aboutHere && !here ? whyNot(f) : undefined, here);
  }

  async function send(text: string, note?: string, here?: Here) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    setNotice(note ?? null);
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
        here,
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

  /**
   * A button that needs to know where the traveller is.
   *
   * Runs inside the tap, so the browser's location prompt follows a gesture the
   * person actually made. The server wrote the question, in their language, with
   * a hole where the place goes; the phone fills it with the nearest station and
   * sends it. Nothing precise enough to call "here", and it asks them to type,
   * rather than repeating the question they just tapped past.
   */
  async function tapChip(c: Chip) {
    if (busy) return;
    if (!c.locate?.ask) return void send(chipText(c), undefined, sharing ? usable(fix) : undefined);
    const f = await lookUp();
    const here = usable(f);
    if (!here) return setNotice(whyNot(f));
    // The question the server wrote, with "my current location" where the place
    // goes; the position itself travels alongside it.
    await send(c.locate.ask.replace("{place}", t.myLocation), undefined, here);
  }

  /** The 📍 button: what is around the traveller, from exactly where they are. */
  async function nearMe() {
    if (busy) return;
    const f = await lookUp();
    const here = usable(f);
    if (!here) return setNotice(whyNot(f));
    await send(t.nearMeQuery, undefined, here);
  }

  const lastAssistantIdx = (() => {
    for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === "assistant") return i;
    return -1;
  })();

  return (
    <div class="shell">
      <header class="hdr">
        <div class="hdr-brand">
          {mascotEnabled() ? (
            <Mascot pose="greet" size={40} label="Haechi, your Seoul guide" />
          ) : (
            <Haru pose="greet" size={40} label="Haru, your Korea trip guide" />
          )}
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
            <div class="mascot-row">
              {mascotEnabled() ? <Mascot pose="greet" size={56} /> : <Haru pose="greet" size={56} />}
            </div>
            <div class="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(t.welcome) }} />
          </div>

          {msgs.length === 0 && (
            <section class="scenarios" aria-label={t.scenariosTitle}>
              <p class="scenarios-title">{t.scenariosTitle}</p>
              <div class="scenario-grid">
                {SCENARIOS[lang].map((s: Scenario) => (
                  <button key={s.send} class="scenario-card" onClick={() => void ask(s.send)}>
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
                    <button key={c.cmdEn} class="chip" onClick={() => void tapChip(c)}>
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
              {mascotEnabled() ? <Mascot pose="think" size={28} /> : <Haru pose="think" size={28} />}
              <span class="dot" /><span class="dot" /><span class="dot" />
              <span class="typing-label">{statusText ?? t.thinking}</span>
            </div>
          )}
        </div>
      </div>

      <footer class="composer-wrap">
        {!online && (
          <p class="notice offline-note">
            {mascotEnabled() ? <Mascot pose="sorry" size={22} /> : <Haru pose="sorry" size={22} />} {t.offline}
          </p>
        )}
        {notice && <p class="notice">{notice}</p>}
        {sharing && (
          <p class="here-bar">
            <span class="here-dot" aria-hidden="true" />
            {t.sharingOn}
            {fix?.accuracy != null && <span class="here-acc"> · ±{formatMetres(fix.accuracy)}</span>}
            {fix && (
              <>
                {" · "}
                <a href={pinLink(fix)} target="_blank" rel="noopener noreferrer">
                  {t.viewOnMap}
                </a>
              </>
            )}
            {" · "}
            <button type="button" class="here-off" onClick={stopSharing}>
              {t.turnOff}
            </button>
          </p>
        )}
        <form
          class="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
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
            <p class="mascot-credit">{mascotEnabled() ? MASCOT_CREDIT : HARU_CREDIT}</p>
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
