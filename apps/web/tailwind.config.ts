import type { Config } from "tailwindcss";
import preset from "@repo/config/tailwind";

export default {
  presets: [preset],
  content: ["./src/**/*.{ts,tsx}"],
} satisfies Config;
