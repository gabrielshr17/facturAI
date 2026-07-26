import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA instalable y offline (base para web/móvil). El service worker se
// autoactualiza; en Fase 1+ se cachearán los assets de la app.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Sistema de Facturación",
        short_name: "Facturación",
        description: "Facturación, inventario y gestión (RD)",
        theme_color: "#2563eb",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
    }),
  ],
  server: { port: 5173 },
  css: {
    // Objeto explícito (aunque vacío) evita que Vite busque un
    // postcss.config.* hacia arriba en el árbol de directorios, lo cual en
    // este entorno encuentra un postcss.config.mjs ajeno en el home del
    // usuario (fuera del repo) y rompe el arranque.
    postcss: { plugins: [] },
  },
});
