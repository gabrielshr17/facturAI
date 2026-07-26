import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearFacturaRepo, crearProductoRepo, crearReportesRepo } from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("reportesRepo", () => {
  let db: SqlDriver;
  beforeEach(async () => { db = await nuevaDb(); });

  async function venta(
    facturas: ReturnType<typeof crearFacturaRepo>,
    productoId: string | null,
    descripcion: string,
    cantidad: number,
    precioUnitario: number,
    metodo: "efectivo" | "tarjeta" = "efectivo",
  ) {
    const t = await facturas.abrirTicket();
    await facturas.agregarLinea(t.id, {
      producto_id: productoId, descripcion, cantidad, precioUnitario, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos: [{ metodo, monto: cantidad * precioUnitario }] });
    return t;
  }

  it("ventasPorDia agrupa el total y la cantidad de facturas por día", async () => {
    const facturas = crearFacturaRepo(db);
    const reportes = crearReportesRepo(db);
    await venta(facturas, null, "Arroz", 1, 50);
    await venta(facturas, null, "Pan", 1, 30);

    const hoy = new Date().toISOString().slice(0, 10);
    const filas = await reportes.ventasPorDia(hoy, hoy);
    expect(filas).toHaveLength(1);
    expect(filas[0].cantidadFacturas).toBe(2);
    expect(filas[0].totalVentas).toBe(80);
  });

  it("productosMasVendidos ordena por cantidad vendida descendente", async () => {
    const facturas = crearFacturaRepo(db);
    const reportes = crearReportesRepo(db);
    await venta(facturas, null, "Arroz", 5, 50);
    await venta(facturas, null, "Pan", 2, 30);

    const hoy = new Date().toISOString().slice(0, 10);
    const filas = await reportes.productosMasVendidos(hoy, hoy);
    expect(filas[0].descripcion).toBe("Arroz");
    expect(filas[0].cantidadVendida).toBe(5);
    expect(filas[1].descripcion).toBe("Pan");
  });

  it("resumenGanancia calcula ingresos, costo estimado y ganancia", async () => {
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const reportes = crearReportesRepo(db);
    const p = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 50 });
    await venta(facturas, p.id, "Arroz", 2, 50);

    const hoy = new Date().toISOString().slice(0, 10);
    const r = await reportes.resumenGanancia(hoy, hoy);
    expect(r.ingresos).toBe(100);
    expect(r.costoEstimado).toBe(60);
    expect(r.gananciaEstimada).toBe(40);
  });

  it("resumenGanancia ignora líneas sin producto_id en el costo (no ingresos)", async () => {
    const facturas = crearFacturaRepo(db);
    const reportes = crearReportesRepo(db);
    await venta(facturas, null, "Artículo suelto", 1, 100);

    const hoy = new Date().toISOString().slice(0, 10);
    const r = await reportes.resumenGanancia(hoy, hoy);
    expect(r.ingresos).toBe(100);
    expect(r.costoEstimado).toBe(0);
  });

  it("resumenItbis suma gravado, exento e itbis del período", async () => {
    const facturas = crearFacturaRepo(db);
    const reportes = crearReportesRepo(db);
    await venta(facturas, null, "Arroz", 1, 50); // itbis18

    const hoy = new Date().toISOString().slice(0, 10);
    const r = await reportes.resumenItbis(hoy, hoy);
    expect(r.totalItbis).toBeGreaterThan(0);
    // El precio es con ITBIS incluido: gravado + itbis = total (exento queda en 0 para este ítem).
    expect(r.totalGravado + r.totalItbis).toBeCloseTo(50, 2);
  });

  it("ventasPorMetodoPago agrupa por método", async () => {
    const facturas = crearFacturaRepo(db);
    const reportes = crearReportesRepo(db);
    await venta(facturas, null, "Arroz", 1, 50, "efectivo");
    await venta(facturas, null, "Pan", 1, 30, "tarjeta");

    const hoy = new Date().toISOString().slice(0, 10);
    const filas = await reportes.ventasPorMetodoPago(hoy, hoy);
    const porMetodo = Object.fromEntries(filas.map((f) => [f.metodo, f.total]));
    expect(porMetodo.efectivo).toBe(50);
    expect(porMetodo.tarjeta).toBe(30);
  });

  it("no cuenta tickets abiertos (sin cobrar)", async () => {
    const facturas = crearFacturaRepo(db);
    const reportes = crearReportesRepo(db);
    await facturas.abrirTicket();

    const hoy = new Date().toISOString().slice(0, 10);
    expect(await reportes.ventasPorDia(hoy, hoy)).toHaveLength(0);
  });
});
