#!/usr/bin/env node
// PostToolUse (Write|Edit): corre ESLint --fix solo sobre el archivo que Claude acaba de tocar — no
// el repo entero, para que el hook sea instantáneo en vez de agregar segundos a cada edición. Sale
// en silencio ante cualquier error de parseo/ejecución: un hook que rompe la sesión por un archivo
// raro (o por no tener ESLint instalado en un checkout viejo) es peor que uno que simplemente no
// lintea ese archivo esta vez.
import { execSync } from "node:child_process";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const filePath = data.tool_response?.filePath ?? data.tool_input?.file_path;
    // `execFileSync("npx", …)` falla en Windows (ENOENT): ahí `npx` es `npx.cmd`, y a diferencia de
    // `execSync` no pasa por una shell que resuelva ese `.cmd`. `execSync` sí, en cualquier SO.
    if (filePath && /\.(ts|tsx)$/.test(filePath)) {
      execSync(`npx eslint --fix "${filePath}"`, { stdio: "inherit", cwd: process.cwd() });
    }
  } catch {
    // Ver comentario de arriba.
  }
});
