import Database from "@tauri-apps/plugin-sql";
import type { SqlDriver } from "@sfr/core";

/**
 * Driver SqlDriver para el escritorio (Tauri), sobre `tauri-plugin-sql`
 * (rusqlite vía sqlx). La base vive en un archivo real dentro del directorio
 * de datos de la app (resuelto por Tauri a partir de "sqlite:<nombre>").
 *
 * `execute()` de sqlx solo acepta un statement por llamada, a diferencia de
 * `db.run()` de sql.js/node:sqlite (que aceptan un lote de statements
 * separados por `;`). Como las migraciones de `core` llegan como un solo
 * string con varios `CREATE TABLE`/`ALTER TABLE`, `exec()` los separa aquí.
 */
export async function crearTauriSqlDriver(): Promise<SqlDriver> {
  const db = await Database.load("sqlite:sfr.db");

  function partirStatements(sql: string): string[] {
    return sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  return {
    async exec(sql) {
      for (const statement of partirStatements(sql)) {
        await db.execute(statement);
      }
    },
    async run(sql, params = []) {
      await db.execute(sql, params as unknown[]);
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return await db.select<T[]>(sql, params);
    },
    async get<T>(sql: string, params: unknown[] = []) {
      const filas = await db.select<T[]>(sql, params);
      return filas[0];
    },
    async close() {
      await db.close();
    },
  };
}
