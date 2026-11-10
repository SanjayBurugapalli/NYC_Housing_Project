import type { Config } from "tailwindcss";

// Design tokens for the BeforeYouRent redesign: a white/near-white ground,
// ink (#12141A) outlines with hard offset shadows, Bricolage Grotesque display
// type over Inter, and the five grade colors. Grade + price colors are also
// mirrored in src/lib/grades.ts for inline styles and Mapbox expressions.
const INK = "#12141A";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: INK, 2: "#3A4050" },
        muted: "#515869",
        hint: "#5A6172",
        line: "#D5DAE2",
        surface: "#F4F6F8",
        block: "#E4E8ED",
        grade: {
          a: "#1FA187",
          b: "#8FD3B6",
          c: "#F4D03F",
          d: "#F28C28",
          f: "#C62F2F",
        },
        price: {
          1: "#DCD6FF",
          2: "#8C7BFF",
          3: "#3D2DB3",
        },
        // Legacy score-* names (rankings page, compare columns) now resolve to
        // the redesign's grade palette so every page reads the same colors.
        score: {
          excellent: "#1FA187",
          good: "#8FD3B6",
          fair: "#F4D03F",
          poor: "#F28C28",
          critical: "#C62F2F",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-bricolage)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "hard-xs": `3px 3px 0 ${INK}`,
        "hard-sm": `4px 4px 0 ${INK}`,
        hard: `5px 5px 0 ${INK}`,
        "hard-md": `6px 6px 0 ${INK}`,
        "hard-lg": `8px 8px 0 ${INK}`,
        "hard-xl": `10px 10px 0 ${INK}`,
      },
      keyframes: {
        "loading-bar": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" },
        },
        "slide-in-left": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-left": {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-100%)" },
        },
        "slide-in-right": {
          "0%":   { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "slide-out-right": {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "slide-in-bottom": {
          "0%":   { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        "slide-out-bottom": {
          "0%":   { transform: "translateY(0)" },
          "100%": { transform: "translateY(100%)" },
        },
        // Floating cards: a short rise + settle, so the card reads as lifted
        // off the map rather than sliding in from an edge.
        "card-in": {
          "0%":   { opacity: "0", transform: "translateY(14px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "card-out": {
          "0%":   { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(10px) scale(0.98)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%":   { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "loading-bar": "loading-bar 1.4s ease-in-out infinite",
        "slide-in-left": "slide-in-left 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-out-left": "slide-out-left 220ms cubic-bezier(0.4, 0, 1, 1) forwards",
        "slide-in-right": "slide-in-right 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-out-right": "slide-out-right 220ms cubic-bezier(0.4, 0, 1, 1) forwards",
        "slide-in-bottom": "slide-in-bottom 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-out-bottom": "slide-out-bottom 220ms cubic-bezier(0.4, 0, 1, 1) forwards",
        "card-in": "card-in 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        "card-out": "card-out 220ms cubic-bezier(0.4, 0, 1, 1) forwards",
        "fade-in": "fade-in 200ms ease-out",
        "fade-out": "fade-out 220ms ease-in forwards",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

export default config;
