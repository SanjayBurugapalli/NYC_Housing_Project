import { GRADE_META, toGrade, type Grade } from "@/lib/grades";

// The letter-grade "window placard": a rounded tile in the grade color with an
// ink outline, optionally tilted and lifted with a hard offset shadow.

// Presets match the sizes used across the design (list rows, chips, the hover
// card, the card header, the landing grade strip, the hero tile).
const SIZES = {
  xs: { w: 24, h: 26, font: 15, radius: 6, border: 1.5 },
  tray: { w: 28, h: 32, font: 18, radius: 7, border: 1.5 },
  sm: { w: 30, h: 34, font: 20, radius: 7, border: 1.5 },
  chip: { w: 34, h: 40, font: 22, radius: 8, border: 2 },
  li: { w: 38, h: 44, font: 24, radius: 9, border: 2 },
  md: { w: 44, h: 50, font: 30, radius: 10, border: 2 },
  hover: { w: 52, h: 60, font: 38, radius: 11, border: 2 },
  deep: { w: 58, h: 66, font: 46, radius: 12, border: 2 },
  sample: { w: 60, h: 68, font: 44, radius: 12, border: 2 },
  lg: { w: 64, h: 72, font: 50, radius: 13, border: 2 },
  grade: { w: 84, h: 96, font: 64, radius: 14, border: 2 },
  xl: { w: 96, h: 110, font: 80, radius: 17, border: 2 },
} as const;

const SHADOWS = {
  none: "",
  xs: "shadow-hard-xs",
  sm: "shadow-hard-sm",
  md: "shadow-hard",
} as const;

export function GradeTile({
  grade,
  size = "md",
  rotate = 0,
  shadow = "none",
  className = "",
  label,
}: {
  grade: Grade | string | null | undefined;
  size?: keyof typeof SIZES;
  rotate?: number;
  shadow?: keyof typeof SHADOWS;
  className?: string;
  /** Accessible name; defaults to "Grade X". Pass "" to mark decorative. */
  label?: string;
}) {
  const g = toGrade(grade, "F");
  const meta = GRADE_META[g];
  const dims = SIZES[size];
  const a11y = label === "" ? { "aria-hidden": true as const } : { role: "img", "aria-label": label ?? `Grade ${g}` };
  return (
    <span
      {...a11y}
      className={`inline-flex shrink-0 items-center justify-center border-ink font-display font-extrabold leading-none ${SHADOWS[shadow]} ${className}`}
      style={{
        width: dims.w,
        height: dims.h,
        fontSize: dims.font,
        borderRadius: dims.radius,
        borderWidth: dims.border,
        background: meta.bg,
        color: meta.fg,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      {g}
    </span>
  );
}

export type { Grade };
