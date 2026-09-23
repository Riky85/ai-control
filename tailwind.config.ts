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
          400: "#6E6E78",
        },
        panel: "#FFFFFF",
        line: "#E6E6EB",
        accent: {
          // Segnaposto: arancio vivo stile Exein, da sostituire col codice esatto del brand.
          DEFAULT: "#FF6A13",
          dark: "#E0550A",
          soft: "#FFF0E6",
        },
        signal: "#C2650C",
        steady: "#1F9254",
        alarm: "#C4433B",
      },
      fontFamily: {
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        brand: ["var(--font-brand)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(20,20,24,0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
