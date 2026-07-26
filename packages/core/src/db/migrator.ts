import type { SqlDriver } from "./driver.js";
import { migrations, type Migration } from "./migrations.js";

/**
 * Aplica las migraciones pendientes en orden. Idempotente: registra las
 * aplicadas en `_migracion` y salta las ya presentes. Devuelve las que aplicó.
 */
export async function migrate(db: SqlDriver): Promise<Migration[]> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migracion (
      id          INTEGER PRIMARY KEY,
      nombre      TEXT NOT NULL,
      aplicada_at TEXT NOT NULL
    );
  `);

  const aplicadas = await db.all<{ id: number }>("SELECT id FROM _migracion");
  const yaAplicadas = new Set(aplicadas.map((r) => r.id));

  const pendientes = migrations
    .filter((m) => !yaAplicadas.has(m.id))
    .sort((a, b) => a.id - b.id);

  for (const m of pendientes) {
    await db.exec(m.sql);
    await db.run(
      "INSERT INTO _migracion (id, nombre, aplicada_at) VALUES (?, ?, ?)",
      [m.id, m.nombre, new Date().toISOString()],
    );
  }

  return pendientes;
}
