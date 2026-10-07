import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // Colori come variabili CSS (globals.css): tema chiaro e scuro con gli
      // stessi nomi. Sidebar scura (#212327) nel tema scuro, bianca nel chiaro.
      colors: {
        ink: {
          DEFAULT: "rgb(var(--c-subtle) / <alpha-value>)",
          100: "rgb(var(--c-text) / <alpha-value>)",
          400: "rgb(var(--c-muted) / <alpha-value>)",
        },
        panel: "rgb(var(--c-panel) / <alpha-value>)",
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        accent: {
          DEFAULT: "#FF7323",
          dark: "#E85E10",
          soft: "rgb(var(--c-accent-soft) / <alpha-value>)",
        },
        signal: "rgb(var(--c-signal) / <alpha-value>)",
        steady: "rgb(var(--c-steady) / <alpha-value>)",
        alarm: "rgb(var(--c-alarm) / <alpha-value>)",
        // Sidebar: #212327 nel tema scuro, bianca con bordo grigio nel chiaro.
        sidebar: {
          DEFAULT: "rgb(var(--c-sidebar) / <alpha-value>)",
          line: "rgb(var(--c-sidebar-line) / <alpha-value>)",
        },
        sb: {
          ink: "rgb(var(--c-sb-ink) / <alpha-value>)",
          soft: "rgb(var(--c-sb-soft) / <alpha-value>)",
          text: "rgb(var(--c-sb-text) / <alpha-value>)",
          muted: "rgb(var(--c-sb-muted) / <alpha-value>)",
          faint: "rgb(var(--c-sb-faint) / <alpha-value>)",
        },
        pop: "rgb(var(--c-pop) / <alpha-value>)",
      },
      // Un solo sans (Inter) per testo, titoli e marchio.
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        brand: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Testo piccolo un filo più grande e con più interlinea: è il più
      // usato (etichette, descrizioni, tabelle) e il più faticoso da leggere.
      fontSize: {
        xs: ["0.8rem", { lineHeight: "1.15rem" }],
        sm: ["0.875rem", { lineHeight: "1.35rem" }],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(20,20,24,0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
