import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Stile OneTrust: contenuto bianco, sidebar nera (colori espliciti in
        // Sidebar.tsx), accento blu-viola, verde/ambra/rosso solo per stato.
        ink: {
          DEFAULT: "#F6F6F8",
          100: "#141418",
          400: "#5F5F69", // grigio secondario: contrasto ~6:1 su bianco (era ~4.9:1)
        },
        panel: "#FFFFFF",
        line: "#E6E6EB",
        accent: {
          // Arancio Exein (#FF7323).
          DEFAULT: "#FF7323",
          dark: "#E85E10",
          soft: "#FFF1E8",
        },
        signal: "#B08500",  // ambra: attenzione — distinto dall'arancio di brand
        steady: "#1F9254",
        alarm: "#C4433B",
      },
      fontFamily: {
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        brand: ["var(--font-brand)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
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
