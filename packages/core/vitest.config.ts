import { defineConfig } from "vitest/config";

// Sin esto, vitest intenta resolver un config de PostCSS y busca hacia
// arriba en el árbol de directorios, lo cual en este entorno encuentra
// un postcss.config.mjs ajeno en el home del usuario (fuera del repo)
// y rompe la corrida. Este paquete no usa CSS, así que lo desactivamos.
export default defineConfig({
  css: {
    // Objeto explícito (aunque vacío) evita que Vite busque un
    // postcss.config.* hacia arriba en el árbol de directorios.
    postcss: { plugins: [] },
  },
});
