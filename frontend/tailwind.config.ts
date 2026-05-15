import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        score: {
          excellent: "#22c55e",
          good: "#84cc16",
          fair: "#eab308",
          poor: "#f97316",
          critical: "#ef4444",
        },
      },
      keyframes: {
        "loading-bar": {
          "0%":   { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(200%)" },
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
      },
      animation: {
        "loading-bar": "loading-bar 1.4s ease-in-out infinite",
        "slide-in-right": "slide-in-right 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-out-right": "slide-out-right 220ms cubic-bezier(0.4, 0, 1, 1) forwards",
        "slide-in-bottom": "slide-in-bottom 260ms cubic-bezier(0.22, 1, 0.36, 1)",
        "slide-out-bottom": "slide-out-bottom 220ms cubic-bezier(0.4, 0, 1, 1) forwards",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

export default config;
