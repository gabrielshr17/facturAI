import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Frontend de escritorio (envuelto por Tauri). Reusa la misma UI compartida.
export default defineConfig({
  plugins: [react()],
  // Tauri sirve el frontend en un puerto fijo durante `tauri dev`.
  clearScreen: false,
  server: { port: 5174, strictPort: true },
  css: {
    // Ver nota equivalente en packages/web/vite.config.ts: evita que Vite
    // busque un postcss.config.* ajeno hacia arriba en el árbol de
    // directorios (hay uno en el home del usuario, fuera del repo).
    postcss: { plugins: [] },
  },
});
