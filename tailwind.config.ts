import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#12151C",
          100: "#EDEFF3",
          400: "#8891A0",
        },
        panel: "#1B1F2A",
        line: "#2A303D",
        signal: "#FFB454", // rilevato / da rivedere
        steady: "#5EEAD4", // noto e approvato
        alarm: "#FB7185",  // solo risk critico
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        body: ["var(--font-body)", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
export default config;
