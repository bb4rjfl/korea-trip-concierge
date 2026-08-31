/**
 * Haechi — Seoul's mascot, as the concierge's face.
 *
 * Seoul's symbol character is published under 공공누리 Type 4: attribution
 * required, **no commercial use, no modification**. This service is run by a
 * registered business, so it needs the city's written approval before the
 * character can appear at all — and the artwork must be used exactly as supplied,
 * never redrawn, recoloured or accessorised.
 *
 * So this component is deliberately built two ways round:
 *
 *   - it renders nothing at all unless VITE_MASCOT is turned on and the approved
 *     artwork is actually present, so an un-approved build cannot leak the
 *     character even by accident;
 *   - it only ever places an official file. There is no CSS filter, no rotation,
 *     no recolour and no cropping anywhere in this file, because any of those
 *     would be a modification.
 *
 * Poses are separate official files rather than transformations of one file.
 */

/** Official artwork we place, by moment. Files live in /public/haechi/. */
export type Pose = "greet" | "guide" | "think" | "sorry";

const FILES: Record<Pose, string> = {
  greet: "/haechi/haechi-greet.png",
  guide: "/haechi/haechi-guide.png",
  think: "/haechi/haechi-think.png",
  sorry: "/haechi/haechi-sorry.png",
};

/** Approval is a build-time switch: off by default, and off in every public build
 *  until Seoul's approval letter is in hand. */
const APPROVED = (import.meta.env?.VITE_MASCOT ?? "").toString() === "on";

export function mascotEnabled(): boolean {
  return APPROVED;
}

interface Props {
  pose: Pose;
  /** Rendered box in CSS pixels. The image keeps its own aspect ratio. */
  size?: number;
  /** Decorative next to text we already read out; label it only when it stands alone. */
  label?: string;
}

export function Mascot({ pose, size = 40, label }: Props) {
  if (!APPROVED) return null;
  return (
    <img
      class="mascot"
      src={FILES[pose]}
      width={size}
      height={size}
      alt={label ?? ""}
      aria-hidden={label ? undefined : "true"}
      loading="lazy"
      // A missing file must not leave a broken-image icon in the chat.
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

/** The credit line the licence requires wherever the character appears. */
export const MASCOT_CREDIT = "서울특별시 상징 캐릭터 '해치' ⓒ서울특별시 (사용 승인)";
