/**
 * Haru (하루) — our own guardian pup, and the face of the concierge.
 *
 * Why we drew our own instead of using Seoul's Haechi
 * ---------------------------------------------------
 * Seoul's symbol character is published under 공공누리 Type 4: attribution,
 * **no commercial use, and no modification**. A character merely *resembling* it
 * would be a derivative work, which is the one thing that licence forbids
 * outright. So Haru is drawn from the same source Seoul drew from — the 해태
 * (獬豸), the horned guardian beast that has sat outside Gyeongbokgung for
 * centuries and is folklore, not anyone's artwork — and shares none of Seoul's
 * design decisions. When the city approves our application, the official Haechi
 * goes in its own slot (see mascot.tsx) and Haru steps aside on Seoul screens.
 *
 * Why SVG rather than an illustration file
 * ----------------------------------------
 * It is a few hundred bytes, so it is on screen before the first answer is; it
 * inherits the page's palette and so cannot be the one element that stays white
 * in dark mode; it stays sharp on a phone; and it needs no asset pipeline, no
 * cache entry, and no licence footnote. The offline shell can draw it too.
 *
 * The name is the product: 하루 means "a day", and a day in Korea is what this
 * service actually plans. It reads the same in Korean, Japanese and Chinese, and
 * an English speaker gets it right on the first try.
 */

export type Pose = "greet" | "guide" | "think" | "sorry";

interface Props {
  pose?: Pose;
  /** Rendered box in CSS pixels. */
  size?: number;
  /** Decorative beside text we already show; label it only when it stands alone. */
  label?: string;
}

/**
 * Eyes carry the whole expression, so each pose is just a different pair — the
 * body never moves. A mascot that reshapes itself every message is a distraction
 * in a chat someone is trying to read directions out of.
 */
function Eyes({ pose }: { pose: Pose }) {
  if (pose === "think") {
    // Looking up and away, the way you do while working something out.
    return (
      <g>
        <circle cx="43" cy="52" r="4.2" fill="var(--haru-ink)" />
        <circle cx="63" cy="52" r="4.2" fill="var(--haru-ink)" />
        <circle cx="44.4" cy="50.4" r="1.5" fill="#fff" />
        <circle cx="64.4" cy="50.4" r="1.5" fill="#fff" />
      </g>
    );
  }
  if (pose === "sorry") {
    // Closed, tilted down — apologetic rather than sad.
    return (
      <g stroke="var(--haru-ink)" stroke-width="3" stroke-linecap="round" fill="none">
        <path d="M38 55q5 -5 10 0" />
        <path d="M58 55q5 -5 10 0" />
      </g>
    );
  }
  if (pose === "guide") {
    // Wide and bright: it has found the thing you asked for.
    return (
      <g>
        <circle cx="42" cy="54" r="5" fill="var(--haru-ink)" />
        <circle cx="64" cy="54" r="5" fill="var(--haru-ink)" />
        <circle cx="43.8" cy="52" r="1.9" fill="#fff" />
        <circle cx="65.8" cy="52" r="1.9" fill="#fff" />
      </g>
    );
  }
  // greet — a small happy squint
  return (
    <g stroke="var(--haru-ink)" stroke-width="3.4" stroke-linecap="round" fill="none">
      <path d="M37 56q5.5 -7 11 0" />
      <path d="M58 56q5.5 -7 11 0" />
    </g>
  );
}

export function Haru({ pose = "greet", size = 40, label }: Props) {
  return (
    <svg
      class="haru"
      width={size}
      height={size}
      viewBox="0 0 106 106"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Mane first: everything that should stick out of it is drawn after, or the
          mane swallows it. The horn and ears were invisible the other way round. */}
      <path
        d="M53 16c10 0 14 4 20 4s11 5 10 12c5 3 7 9 4 14 4 5 3 12-2 15 0 7-5 12-12 12-4 5-12 8-20 8s-16-3-20-8c-7 0-12-5-12-12-5-3-6-10-2-15-3-5-1-11 4-14-1-7 4-12 10-12s10-4 20-4z"
        fill="var(--haru-mane)"
      />
      {/* The horn. A haetae is a horned beast; without one this is a puppy. It has
          to clear the mane to be seen, so it starts inside it and ends well above. */}
      <path d="M53 1l7 21h-14z" fill="var(--haru-horn)" />
      {/* Ear tufts, a shade darker than the mane and set on its shoulders. */}
      <path d="M23 40q-7 -12 1 -16t13 9z" fill="var(--haru-horn)" />
      <path d="M83 40q7 -12 -1 -16t-13 9z" fill="var(--haru-horn)" />
      {/* Face, sitting proud of the mane */}
      <ellipse cx="53" cy="56" rx="25" ry="23" fill="var(--haru-face)" />
      <ellipse cx="31" cy="64" rx="5" ry="3.4" fill="var(--haru-blush)" />
      <ellipse cx="75" cy="64" rx="5" ry="3.4" fill="var(--haru-blush)" />
      <Eyes pose={pose} />
      {/* Muzzle. Two tones apart from the face, or it disappears into it. */}
      <ellipse cx="53" cy="69" rx="12" ry="8.5" fill="var(--haru-snout)" />
      <path d="M46.6 65.6h12.8L53 72.4z" fill="var(--haru-ink)" />
      <path
        d="M53 72.4v2.6M53 75q-3.6 0-4.8-2.2M53 75q3.6 0 4.8-2.2"
        stroke="var(--haru-ink)"
        stroke-width="2.1"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
      {/* Collar and bell, the way the stone guardians wear them. The strap runs
          under the chin so the bell hangs from the character instead of floating. */}
      <path d="M31 82q22 12 44 0" stroke="var(--haru-horn)" stroke-width="6" stroke-linecap="round" fill="none" />
      <circle cx="53" cy="93" r="9" fill="var(--haru-bell)" />
      <path d="M44.6 90.4h16.8" stroke="var(--haru-ink)" stroke-width="2.2" stroke-linecap="round" />
      <circle cx="53" cy="96.4" r="2" fill="var(--haru-ink)" />
    </svg>
  );
}

/** Ours, so there is nothing to attribute — stated plainly rather than left blank. */
export const HARU_CREDIT = "Haru — Korea Trip Concierge original character";
