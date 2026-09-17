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
        accent: {
          DEFAULT: "#6D4FEB", // indaco — colore di brand per azioni primarie e stato attivo
          dark: "#5A3AD1",
          soft: "#F1EDFD",    // sfondo tenue per stati attivi/selezionati
        },
        signal: "#C2740F",    // attenzione / rischio medio
        steady: "#1F9254",    // approvato / rischio basso
        alarm: "#D1453B",     // rischio alto/critico
      },
      fontFamily: {
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(20,20,18,0.04), 0 2px 8px -2px rgba(20,20,18,0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
