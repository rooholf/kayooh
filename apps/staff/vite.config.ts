import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      devOptions: { enabled: true },
      manifest: {
        name: "Kayooh Pindai Staf",
        short_name: "Pindai Staf",
        description:
          "Pencatatan serah terima sepeda di outlet. Setiap pindaian tercatat di perangkat dan tetap bekerja saat koneksi putus.",
        lang: "id",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#E7DFC9",
        theme_color: "#2C4A7C",
        icons: [
          { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
          { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff,woff2}"],
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: {
    port: 3002,
    proxy: { "/api": "http://localhost:3001" },
  },
  preview: {
    port: 3002,
    proxy: { "/api": "http://localhost:3001" },
  },
});
