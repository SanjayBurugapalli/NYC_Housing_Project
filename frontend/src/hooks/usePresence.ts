"use client";

import { useEffect, useState } from "react";

// Must match the exit keyframe durations in tailwind.config.ts (220ms).
export const EXIT_MS = 220;

/**
 * Keeps a panel mounted long enough to play its exit animation when `open` flips
 * to false. Returns `shouldRender` (true while open OR animating out) and
 * `entering` (true while open, false while exit-animating) so the caller can
 * choose the enter vs exit animation class. Mounts synchronously during render
 * on the closed→open transition so the panel's first paint includes the
 * enter animation class — otherwise the panel can flash into place before
 * the animation has a chance to run.
 */
export function usePresence(open: boolean): { shouldRender: boolean; entering: boolean } {
  const [mounted, setMounted] = useState(open);

  if (open && !mounted) {
    setMounted(true);
  }

  useEffect(() => {
    if (!open && mounted) {
      const t = setTimeout(() => setMounted(false), EXIT_MS);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  return { shouldRender: mounted, entering: open };
}
