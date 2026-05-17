import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        panelSoft: "rgb(var(--color-panel-soft) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        mint: "rgb(var(--color-mint) / <alpha-value>)",
        rose: "rgb(var(--color-rose) / <alpha-value>)",
        gold: "rgb(var(--color-gold) / <alpha-value>)",
      },
      boxShadow: {
        glow: "0 18px 80px rgba(112, 214, 255, 0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
