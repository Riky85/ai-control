import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Tema chiaro ispirato ad Angar: canvas quasi bianco, card bianche,
        // bordi sottili. Stessi nomi di prima — solo i valori cambiano.
        ink: {
          DEFAULT: "#F5F5F4", // grigio Angar — neutro, non il beige caldo di prima
          100: "#1A1A18",     // testo principale, quasi nero
          400: "#8C8A83",     // testo secondario — grigio pulito
        },
        panel: "#FFFFFF",     // card
        line: "#EAE8E3",      // bordi, sottili e puliti
        // Palette Angar: nessun colore di brand acceso — i bottoni/azioni
        // primarie sono neri (come "Import customers" / "Upgrade" in Angar),
        // il verde è riservato allo stato positivo (come "Agent is online"),
        // non è un accento di brand separato.
        accent: {
          DEFAULT: "#1A1A18",
          dark: "#000000",
          soft: "#EDECE9",
        },
        signal: "#B7791F",    // attenzione / rischio medio
        steady: "#1F9254",    // approvato / sano / online — verde Angar
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
