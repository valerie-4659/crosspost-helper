import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0d10",
        panel: "#141820",
        panelSoft: "#1c222d",
        line: "#2a3241",
        accent: "#70d6ff",
        mint: "#8cffc1",
        rose: "#ff8fab",
        gold: "#ffd166",
      },
      boxShadow: {
        glow: "0 18px 80px rgba(112, 214, 255, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
