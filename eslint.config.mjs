import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/src-tauri/target/**",
      "**/src-tauri/gen/**",
      "**/*.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Regla explícita del CLAUDE.md global: nada de `any` genérico.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/ui/**/*.{ts,tsx}", "packages/web/**/*.{ts,tsx}", "packages/desktop/**/*.{ts,tsx}"],
    plugins: { react, "react-hooks": reactHooks },
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // JSX runtime automático (React 18, `jsx: "react-jsx"` en cada tsconfig): no hace falta
      // `import React` para usar JSX, así que esta regla de la config "recommended" de react
      // sobra acá y solo generaría ruido.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // Regla nueva/experimental de react-hooks v7, pensada de cara al React Compiler: marca como
      // error patrones comunes y legítimos (limpiar resultados al inicio de un efecto debounced,
      // resetear estado al cambiar de ticket, etc.) que no son bugs reales acá. Advertencia, no
      // bloqueo — forzar una reescritura de efectos que funcionan no es el objetivo de este lint.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Prettier al final: apaga las reglas de estilo que chocarían con su formato — el estilo lo
  // define Prettier, ESLint se queda con calidad de código (variables sin usar, hooks mal usados, etc.).
  prettier,
);
