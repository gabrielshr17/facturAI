import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearPromocionRepo, crearProductoRepo, crearDepartamentoRepo, aplicarDescuento, ValidacionError } from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

function hoyMasDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

describe("dominio promocion — aplicarDescuento", () => {
  it("descuento porcentual", () => {
    expect(aplicarDescuento(100, { tipo: "porcentaje", valor: 20 })).toBe(80);
  });

  it("descuento de monto fijo", () => {
    expect(aplicarDescuento(100, { tipo: "monto_fijo", valor: 30 })).toBe(70);
  });

  it("nunca deja el precio negativo", () => {
    expect(aplicarDescuento(10, { tipo: "monto_fijo", valor: 50 })).toBe(0);
  });
});

describe("promocionRepo", () => {
  let db: SqlDriver;
  beforeEach(async () => { db = await nuevaDb(); });

  it("crea una promoción de producto y la encuentra vigente", async () => {
    const productos = crearProductoRepo(db);
    const promociones = crearPromocionRepo(db);
    const p = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 50 });

    await promociones.crear({
      nombre: "20% Arroz", tipo: "porcentaje", valor: 20, aplicaA: "producto", productoId: p.id,
      fechaInicio: hoyMasDias(-1), fechaFin: hoyMasDias(1),
    });

    const hoy = hoyMasDias(0);
    const aplicable = await promociones.obtenerAplicable(p.id, null, hoy);
    expect(aplicable?.nombre).toBe("20% Arroz");
  });

  it("no aplica una promoción fuera de vigencia", async () => {
    const productos = crearProductoRepo(db);
    const promociones = crearPromocionRepo(db);
    const p = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 50 });

    await promociones.crear({
      nombre: "Vencida", tipo: "porcentaje", valor: 20, aplicaA: "producto", productoId: p.id,
      fechaInicio: hoyMasDias(-10), fechaFin: hoyMasDias(-5),
    });

    expect(await promociones.obtenerAplicable(p.id, null, hoyMasDias(0))).toBeUndefined();
  });

  it("prioriza la promoción de producto sobre la de departamento", async () => {
    const productos = crearProductoRepo(db);
    const departamentos = crearDepartamentoRepo(db);
    const promociones = crearPromocionRepo(db);
    const dep = await departamentos.crear("Abarrotes");
    const p = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 50, departamento_id: dep.id });

    await promociones.crear({
      nombre: "Depto 10%", tipo: "porcentaje", valor: 10, aplicaA: "departamento", departamentoId: dep.id,
      fechaInicio: hoyMasDias(-1), fechaFin: hoyMasDias(1),
    });
    await promociones.crear({
      nombre: "Producto 25%", tipo: "porcentaje", valor: 25, aplicaA: "producto", productoId: p.id,
      fechaInicio: hoyMasDias(-1), fechaFin: hoyMasDias(1),
    });

    const aplicable = await promociones.obtenerAplicable(p.id, dep.id, hoyMasDias(0));
    expect(aplicable?.nombre).toBe("Producto 25%");
  });

  it("una promoción 'todo' aplica incluso a artículos no registrados (sin producto_id)", async () => {
    const promociones = crearPromocionRepo(db);
    await promociones.crear({
      nombre: "Todo 5%", tipo: "porcentaje", valor: 5, aplicaA: "todo",
      fechaInicio: hoyMasDias(-1), fechaFin: hoyMasDias(1),
    });

    const aplicable = await promociones.obtenerAplicable(null, null, hoyMasDias(0));
    expect(aplicable?.nombre).toBe("Todo 5%");
  });

  it("rechaza un descuento porcentual mayor a 100", async () => {
    const promociones = crearPromocionRepo(db);
    await expect(
      promociones.crear({ nombre: "X", tipo: "porcentaje", valor: 150, aplicaA: "todo", fechaInicio: hoyMasDias(0), fechaFin: hoyMasDias(1) }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("rechaza aplicaA='producto' sin productoId", async () => {
    const promociones = crearPromocionRepo(db);
    await expect(
      promociones.crear({ nombre: "X", tipo: "porcentaje", valor: 10, aplicaA: "producto", fechaInicio: hoyMasDias(0), fechaFin: hoyMasDias(1) }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("desactivada no aparece como aplicable", async () => {
    const productos = crearProductoRepo(db);
    const promociones = crearPromocionRepo(db);
    const p = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 50 });
    await promociones.crear({
      nombre: "Inactiva", tipo: "porcentaje", valor: 20, aplicaA: "producto", productoId: p.id,
      fechaInicio: hoyMasDias(-1), fechaFin: hoyMasDias(1), activa: false,
    });
    expect(await promociones.obtenerAplicable(p.id, null, hoyMasDias(0))).toBeUndefined();
  });
});
