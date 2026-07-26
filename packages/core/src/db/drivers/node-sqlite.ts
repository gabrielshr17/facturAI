import { createRequire } from "node:module";
import type { SqlDriver } from "../driver.js";

// `node:sqlite` es muy reciente y algunos bundlers (Vite/vitest) no lo reconocen
// como builtin y fallan al analizarlo estáticamente. Lo cargamos por require
// **dentro de la factory** (no en el nivel superior del módulo) para que el
// simple import de este archivo no ejecute `require` — así nunca rompe fuera de Node.
function cargarDatabaseSync() {
  const require = createRequire(import.meta.url);
  return (require("node:sqlite") as typeof import("node:sqlite")).DatabaseSync;
}

/**
 * Driver basado en el módulo integrado `node:sqlite` (Node >= 22).
 * Uso: migraciones, seeds y tests en Node. En la app real se usan
 * `tauri-plugin-sql` (escritorio) y `wa-sqlite` (PWA), que implementan la
 * misma interfaz `SqlDriver`.
 *
 * @param path Ruta del archivo `.db`, o `:memory:` (default) para tests.
 */
export function createNodeSqliteDriver(path = ":memory:"): SqlDriver {
  const DatabaseSync = cargarDatabaseSync();
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");

  return {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []) {
      db.prepare(sql).run(...(params as never[]));
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async get<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).get(...(params as never[])) as T | undefined;
    },
    async close() {
      db.close();
    },
  };
}
