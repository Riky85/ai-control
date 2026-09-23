import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Tema scuro definitivo, come nel riferimento condiviso: base quasi
        // nera, card leggermente più chiare per separazione, accento
        // ciano/blu — non più un tema chiaro con un accento scuro.
        ink: {
          DEFAULT: "#0A0B0E",
          100: "#F2F3F5",
          400: "#8B8E97",
        },
        panel: "#15171C",
        line: "#262930",
        accent: {
          DEFAULT: "#4C9EFF",
          dark: "#3A82DB",
          soft: "#173049",
        },
        signal: "#E8A93B",    // attenzione / rischio medio — chiaro abbastanza da leggersi su scuro
        steady: "#34C77B",    // approvato / sano
        alarm: "#F0655A",     // rischio alto/critico
      },
      fontFamily: {
        display: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(0,0,0,0.24)",
      },
    },
  },
  plugins: [],
};
export default config;
