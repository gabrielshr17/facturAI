import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearFacturaRepo, crearCorteCajaRepo, ValidacionError } from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("corteCajaRepo — resumen y registro (Corte de caja)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function venta(
    facturas: ReturnType<typeof crearFacturaRepo>,
    pagos: { metodo: "efectivo" | "tarjeta" | "transferencia" | "credito"; monto: number }[],
  ) {
    const t = await facturas.abrirTicket();
    const total = pagos.reduce((s, p) => s + p.monto, 0);
    await facturas.agregarLinea(t.id, {
      descripcion: "Artículo", cantidad: 1, precioUnitario: total, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos });
  }

  it("calcula totales por método de pago del período", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);

    await venta(facturas, [{ metodo: "efectivo", monto: 100 }]);
    await venta(facturas, [{ metodo: "tarjeta", monto: 60 }, { metodo: "efectivo", monto: 40 }]);

    const hoy = new Date().toISOString().slice(0, 10);
    const resumen = await cortes.calcularResumen(hoy, hoy);
    expect(resumen.cantidadFacturas).toBe(2);
    expect(resumen.totalVentas).toBe(200);
    expect(resumen.totalEfectivo).toBe(140);
    expect(resumen.totalTarjeta).toBe(60);
    expect(resumen.totalTransferencia).toBe(0);
  });

  it("no incluye tickets abiertos (sin cobrar) en el resumen", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);
    await facturas.abrirTicket();

    const hoy = new Date().toISOString().slice(0, 10);
    const resumen = await cortes.calcularResumen(hoy, hoy);
    expect(resumen.cantidadFacturas).toBe(0);
    expect(resumen.totalVentas).toBe(0);
  });

  it("rechaza un período con 'desde' posterior a 'hasta'", async () => {
    const cortes = crearCorteCajaRepo(db);
    await expect(cortes.calcularResumen("2026-02-01", "2026-01-01")).rejects.toBeInstanceOf(ValidacionError);
  });

  it("registra el corte con efectivo esperado y diferencia calculados", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);
    await venta(facturas, [{ metodo: "efectivo", monto: 100 }]);

    const hoy = new Date().toISOString().slice(0, 10);
    const corte = await cortes.registrarCorte({
      desde: hoy, hasta: hoy, montoInicial: 500, efectivoContado: 610,
    });

    expect(corte.total_efectivo).toBe(100);
    expect(corte.efectivo_esperado).toBe(600); // 500 fondo + 100 ventas
    expect(corte.diferencia).toBe(10); // sobraron 10
    expect(corte.estado).toBe("cerrado");
  });

  it("rechaza montos negativos al registrar", async () => {
    const cortes = crearCorteCajaRepo(db);
    const hoy = new Date().toISOString().slice(0, 10);
    await expect(
      cortes.registrarCorte({ desde: hoy, hasta: hoy, montoInicial: -1, efectivoContado: 0 }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("lista los cortes registrados, más reciente primero", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);
    const hoy = new Date().toISOString().slice(0, 10);

    await venta(facturas, [{ metodo: "efectivo", monto: 50 }]);
    await cortes.registrarCorte({ desde: hoy, hasta: hoy, montoInicial: 0, efectivoContado: 50 });
    await new Promise((r) => setTimeout(r, 5));
    await venta(facturas, [{ metodo: "efectivo", monto: 30 }]);
    const segundo = await cortes.registrarCorte({ desde: hoy, hasta: hoy, montoInicial: 0, efectivoContado: 80 });

    const lista = await cortes.listar();
    expect(lista[0].id).toBe(segundo.id);
    expect(lista).toHaveLength(2);
  });
});
