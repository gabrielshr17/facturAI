import { describe, it, expect } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import { seed } from "../src/db/seed.js";

/**
 * Criterio de aceptación de Fase 0: las migraciones aplican limpio y los seeds
 * cargan. Se prueba sobre SQLite en memoria.
 */
describe("Fase 0 — migraciones y seed", () => {
  const TABLAS_MVP = [
    "negocio",
    "usuario",
    "caja",
    "departamento",
    "producto",
    "cliente",
    "factura",
    "factura_linea",
    "pago",
  ];

  it("aplica todas las tablas del MVP", async () => {
    const db = createNodeSqliteDriver();
    const aplicadas = await migrate(db);
    expect(aplicadas.length).toBeGreaterThan(0);

    const filas = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
    const nombres = filas.map((f) => f.name);
    for (const t of TABLAS_MVP) expect(nombres).toContain(t);
  });

  it("es idempotente: correr migrate dos veces no reaplica", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    const segunda = await migrate(db);
    expect(segunda.length).toBe(0);
  });

  it("carga los seeds (producto completo + factura normal)", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);

    const prod = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM producto");
    expect(prod?.n).toBe(1);

    const fac = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM factura");
    expect(fac?.n).toBe(1);

    // El desglose de la factura de ejemplo cuadra: gravado + itbis = total.
    const f = await db.get<{ subtotal_gravado: number; total_itbis: number; total: number }>(
      "SELECT subtotal_gravado, total_itbis, total FROM factura WHERE id = 'fac-demo'",
    );
    expect(f).toBeDefined();
    expect(f!.subtotal_gravado + f!.total_itbis).toBeCloseTo(f!.total, 2);
  });

  it("seed es idempotente", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);
    await seed(db);
    const prod = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM producto");
    expect(prod?.n).toBe(1);
  });
});
