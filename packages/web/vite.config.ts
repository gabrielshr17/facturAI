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
        name: "facturAI",
        short_name: "facturAI",
        description: "Facturación, inventario y gestión (RD)",
        // El acento real de la app es rojo (`--sfr-acento: #991b1b`); estaba en azul, así que la
        // barra de estado y la pantalla de carga en Android salían de un color que la app no usa.
        theme_color: "#991b1b",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          // Chrome en Android no usa SVG para el icono de la app instalada: sin un PNG se cae a
          // una miniatura de la página.
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // El `maskable` va como icono APARTE, no como propósito extra del mismo archivo: Android
          // le aplica su recorte adaptativo (que puede ser un círculo), y a la ficha normal le
          // comería la antena y el rasgado. Esta variante trae el fondo a sangre y la marca
          // encogida dentro de la zona segura. Los PNG salen de `brand/generar-iconos.mjs`.
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
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
