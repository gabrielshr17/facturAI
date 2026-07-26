import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";

// Aplica migraciones sobre un archivo .db local (default: ./local.db).
const path = process.argv[2] ?? "local.db";
const db = createNodeSqliteDriver(path);

const aplicadas = await migrate(db);
if (aplicadas.length === 0) {
  console.log(`✓ Sin migraciones pendientes (${path})`);
} else {
  console.log(`✓ Aplicadas ${aplicadas.length} migración(es) en ${path}:`);
  for (const m of aplicadas) console.log(`  - ${m.id} ${m.nombre}`);
}
await db.close?.();
