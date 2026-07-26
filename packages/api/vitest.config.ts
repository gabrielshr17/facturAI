import { defineConfig } from "vitest/config";

// Ver la nota equivalente en packages/core/vitest.config.ts: evita que Vite
// busque un postcss.config.* ajeno hacia arriba en el árbol de directorios.
export default defineConfig({
  css: {
    postcss: { plugins: [] },
  },
});
