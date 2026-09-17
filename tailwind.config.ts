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
        accent: "#1A1A18",    // hover → nero pieno, come i bottoni OneTrust
        signal: "#C2740F",    // attenzione / rischio medio
        steady: "#1F9254",    // approvato / rischio basso
        alarm: "#D1453B",     // rischio alto/critico
      },
      fontFamily: {
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
export default config;
