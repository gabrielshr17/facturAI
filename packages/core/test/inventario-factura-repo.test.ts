import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearFacturaRepo,
  crearProductoRepo,
  crearNegocioRepo,
  crearMovimientoInventarioRepo,
  ValidacionError,
} from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("factura-repo + inventario (§3: inventario configurable, política por producto)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function activarInventario() {
    await crearNegocioRepo(db).guardar({ nombre_comercial: "Test", inventario_activo: true });
  }

  it("con inventario apagado, vende sin importar la existencia", async () => {
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });
    // existencia queda null por defecto (inventario off) — igual debe poder vender.

    const t = await facturas.abrirTicket();
    await expect(
      facturas.agregarLinea(t.id, {
        producto_id: p.id, descripcion: p.descripcion, cantidad: 100,
        precioUnitario: 20, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
      }),
    ).resolves.toBeDefined();
  });

  it("política 'bloquear': rechaza agregar más cantidad de la existencia", async () => {
    await activarInventario();
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });
    await productos.ajustarExistencia(p.id, 5);
    await productos.actualizar(p.id, { descripcion: "Agua", politica_sin_existencia: "bloquear" });

    const t = await facturas.abrirTicket();
    await expect(
      facturas.agregarLinea(t.id, {
        producto_id: p.id, descripcion: "Agua", cantidad: 10,
        precioUnitario: 20, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
      }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("política 'advertir': permite agregar aunque falte existencia", async () => {
    await activarInventario();
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });
    await productos.ajustarExistencia(p.id, 5);
    // 'advertir' es la política por defecto.

    const t = await facturas.abrirTicket();
    await expect(
      facturas.agregarLinea(t.id, {
        producto_id: p.id, descripcion: "Agua", cantidad: 10,
        precioUnitario: 20, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
      }),
    ).resolves.toBeDefined();
  });

  it("al cobrar con inventario activo, descuenta existencia y registra el movimiento", async () => {
    await activarInventario();
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const movimientos = crearMovimientoInventarioRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });
    await productos.ajustarExistencia(p.id, 20);

    const t = await facturas.abrirTicket();
    await facturas.agregarLinea(t.id, {
      producto_id: p.id, descripcion: "Agua", cantidad: 3,
      precioUnitario: 20, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 60 }] });

    const actualizado = await productos.obtener(p.id);
    expect(actualizado?.existencia).toBe(17);

    const historial = await movimientos.listarPorProducto(p.id);
    const venta = historial.find((m) => m.tipo === "venta");
    expect(venta?.cantidad).toBe(-3);
  });

  it("al cobrar con inventario apagado, no descuenta existencia ni genera movimientos", async () => {
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const movimientos = crearMovimientoInventarioRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });

    const t = await facturas.abrirTicket();
    await facturas.agregarLinea(t.id, {
      producto_id: p.id, descripcion: "Agua", cantidad: 3,
      precioUnitario: 20, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 60 }] });

    const actualizado = await productos.obtener(p.id);
    expect(actualizado?.existencia).toBeNull();
    expect(await movimientos.listarPorProducto(p.id)).toHaveLength(0);
  });

  it("no descuenta existencia de artículos no registrados (sin producto_id)", async () => {
    await activarInventario();
    const facturas = crearFacturaRepo(db);
    const t = await facturas.abrirTicket();
    await facturas.agregarLinea(t.id, {
      producto_id: null, descripcion: "Suelto", cantidad: 1,
      precioUnitario: 20, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
    });
    await expect(
      facturas.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 20 }] }),
    ).resolves.toBeDefined();
  });
});

describe("producto-repo — ajustarExistencia", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("corrige la existencia y registra el delta como 'ajuste'", async () => {
    const productos = crearProductoRepo(db);
    const movimientos = crearMovimientoInventarioRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });

    await productos.ajustarExistencia(p.id, 50);
    let actual = await productos.obtener(p.id);
    expect(actual?.existencia).toBe(50);

    await productos.ajustarExistencia(p.id, 30);
    actual = await productos.obtener(p.id);
    expect(actual?.existencia).toBe(30);

    const historial = await movimientos.listarPorProducto(p.id);
    expect(historial).toHaveLength(2);
    expect(historial.map((m) => m.cantidad).sort((a, b) => a - b)).toEqual([-20, 50]);
  });

  it("rechaza una existencia negativa", async () => {
    const productos = crearProductoRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });
    await expect(productos.ajustarExistencia(p.id, -1)).rejects.toBeInstanceOf(ValidacionError);
  });
});
