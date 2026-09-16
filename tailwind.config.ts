import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0F1114",
          100: "#EDEEF0",
          400: "#888C93",
        },
        panel: "#17191D",
        line: "#26282D",
        // Un solo colore funzionale per azioni/link/brand — non decorativo.
        accent: "#5B8DEF",
        // Indicatori di rischio/stato: desaturati, pensati per un pallino
        // o un bordo sottile, non per riempire badge interi.
        signal: "#C99A4B", // attenzione / da rivedere
        steady: "#5C8A7A", // noto e approvato
        alarm: "#B85C56",  // rischio alto/critico
      },
      fontFamily: {
        // Un'unica famiglia in tutta la piattaforma (solo pesi diversi),
        // per una lettura più sobria e meno "da brand startup".
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
export default config;
