import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Tema scuro ispirato a Exa.ai / OpenRouter: canvas quasi nero,
        // card leggermente più chiare per separazione, bordi sottili.
        // Stessi nomi di prima — solo i valori esadecimali cambiano.
        ink: {
          DEFAULT: "#0A0A0A", // sfondo di pagina, quasi nero
          100: "#F2F2F0",     // testo principale, quasi bianco
          400: "#8B8B88",     // testo secondario
        },
        panel: "#141413",     // card — leggermente più chiara dello sfondo
        line: "#262624",      // bordi sottili
        // Arancio "Claude" come colore di brand/azioni primarie — distinto
        // dal verde "approvato" (steady), che resta il significato universale
        // di stato positivo indipendentemente dal colore di brand scelto.
        accent: {
          DEFAULT: "#D97757",
          dark: "#E8926F",
          soft: "#2A1B15",
        },
        signal: "#D9A441",    // attenzione / rischio medio — più chiaro per leggibilità su sfondo scuro
        steady: "#3EB271",    // approvato / sano — verde indipendente dal brand, più chiaro su scuro
        alarm: "#E5534B",     // rischio alto/critico — più chiaro su scuro
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
