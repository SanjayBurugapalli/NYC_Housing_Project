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
    },
  },
  plugins: [require("@tailwindcss/forms")],
};

export default config;
