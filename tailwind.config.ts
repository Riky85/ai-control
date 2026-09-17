import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Stessi nomi di prima, valori ribaltati per il tema chiaro
        // ispirato a OneTrust: "ink" resta lo sfondo di pagina, "ink-100"
        // resta il testo principale — solo i valori esadecimali cambiano.
        ink: {
          DEFAULT: "#F6F5F2", // sfondo di pagina, bianco caldo appena percettibile
          100: "#1A1A18",     // testo principale, quasi nero
          400: "#8C8A83",     // testo secondario — grigio pulito, non olivastro
        },
        panel: "#FFFFFF",     // card
        line: "#EAE8E3",      // bordi, sottili e puliti
        // Un solo verde di brand, controllato — fa doppio servizio da
        // colore d'azione/stato-attivo E da "approvato/sano" (il documento
        // condiviso chiede esplicitamente un solo accento, non due).
        accent: {
          DEFAULT: "#1F9254",
          dark: "#17753F",
          soft: "#EAF6EF",
        },
        signal: "#B7791F",    // attenzione / rischio medio — giallo-senape tenue, non arancio acceso
        steady: "#1F9254",    // alias dello stesso verde di brand
        alarm: "#C4433B",     // rischio alto/critico
      },
      fontFamily: {
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 1px 1px 0 rgba(20,20,18,0.03)",
      },
    },
  },
  plugins: [],
};
export default config;
