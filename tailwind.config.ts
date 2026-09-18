import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Tema chiaro ispirato ad Angar: canvas quasi bianco, card bianche,
        // bordi sottili. Stessi nomi di prima — solo i valori cambiano.
        ink: {
          DEFAULT: "#F6F5F2", // sfondo di pagina, bianco caldo appena percettibile
          100: "#1A1A18",     // testo principale, quasi nero
          400: "#8C8A83",     // testo secondario — grigio pulito
        },
        panel: "#FFFFFF",     // card
        line: "#EAE8E3",      // bordi, sottili e puliti
        // Arancio "Claude" come colore di brand/azioni primarie — distinto
        // dal verde "approvato" (steady), che resta il significato universale
        // di stato positivo indipendentemente dal colore di brand scelto.
        accent: {
          DEFAULT: "#D97757",
          dark: "#C15F3C",
          soft: "#FBEEEA",
        },
        signal: "#B7791F",    // attenzione / rischio medio
        steady: "#1F9254",    // approvato / sano
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
