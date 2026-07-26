import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import { seed } from "../src/db/seed.js";

// Migra y carga datos de ejemplo sobre un archivo .db local (default: ./local.db).
const path = process.argv[2] ?? "local.db";
const db = createNodeSqliteDriver(path);

await migrate(db);
await seed(db);

const prod = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM producto");
const fac = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM factura");
console.log(`✓ Seed listo en ${path}: ${prod?.n ?? 0} producto(s), ${fac?.n ?? 0} factura(s)`);
await db.close?.();
