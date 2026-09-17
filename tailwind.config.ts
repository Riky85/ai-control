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
          DEFAULT: "#EFEDE6", // sfondo di pagina, crema caldo
          100: "#18181B",     // testo principale, quasi nero
          400: "#75746D",     // testo secondario
        },
        panel: "#FFFFFF",     // card
        line: "#E3E0D6",      // bordi
        accent: "#18181B",    // hover → nero pieno, come i bottoni OneTrust
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
