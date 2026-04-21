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
      },
      animation: {
        "loading-bar": "loading-bar 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

export default config;
