import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Rivoluzione colore: base fredda e neutra (non più calda/beige),
        // accento indaco profondo — il registro cromatico usato davvero
        // dai prodotti di sicurezza enterprise (Vanta) invece di arancio
        // o verde, che qui restano riservati al solo significato di rischio.
        ink: {
          DEFAULT: "#F7F7F9",
          100: "#16161A",
          400: "#84848C",
        },
        panel: "#FFFFFF",
        line: "#E7E7EC",
        accent: {
          DEFAULT: "#3B3564",
          dark: "#292447",
          soft: "#EEECF6",
        },
        signal: "#C2650C",    // attenzione / rischio medio — più vivido, meno "senape"
        steady: "#1F9254",    // approvato / sano — invariato
        alarm: "#C4433B",     // rischio alto/critico — invariato
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
