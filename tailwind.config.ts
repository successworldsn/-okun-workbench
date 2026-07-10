import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        obsidian: "#0A0E1A", // base background
        surface: "#111827", // card
        elevated: "#1E293B", // hover/modal surface, also used as default border
        bone: "#F8FAFC", // primary text
        ash: "#94A3B8", // secondary text
        muted: "#64748B", // tertiary text
        cyan: { DEFAULT: "#06B6D4" }, // "system alive"
        violet: { DEFAULT: "#8B5CF6" }, // "sacred"
        gold: "#C9A84C", // CTAs, Àṣẹ moments
        "status-green": "#10B981",
        "status-amber": "#F59E0B",
        "status-red": "#EF4444",
        "status-gray": "#6B7280",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-data)", "monospace"],
      },
      borderRadius: {
        card: "12px",
        control: "10px",
        input: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
