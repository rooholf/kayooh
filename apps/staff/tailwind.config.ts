import type { Config } from "tailwindcss";
import preset from "@repo/config/tailwind";

export default {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        card: "#E7DFC9",
        ink: "#1B1B18",
        rule: "#2C4A7C",
        signal: "#A03227",
        desk: "#D9CEB1",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["Roboto Mono", "ui-monospace", "monospace"],
      },
    },
  },
} satisfies Config;
