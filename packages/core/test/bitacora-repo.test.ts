import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearBitacoraRepo, crearProductoRepo, crearClienteRepo, crearFacturaRepo } from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("bitacoraRepo — registrar y listar (§ Caja y auditoría)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("registra una acción y la lista, más reciente primero", async () => {
    const bitacora = crearBitacoraRepo(db);
    await bitacora.registrar({ accion: "eliminar", entidad: "producto", entidadId: "p1", resumen: "Test" });
    await new Promise((r) => setTimeout(r, 5));
    const segundo = await bitacora.registrar({ accion: "cobrar", entidad: "factura", entidadId: "f1" });

    const lista = await bitacora.listar();
    expect(lista[0].id).toBe(segundo.id);
    expect(lista).toHaveLength(2);
  });

  it("filtra por entidad y período", async () => {
    const bitacora = crearBitacoraRepo(db);
    await bitacora.registrar({ accion: "eliminar", entidad: "producto", entidadId: "p1" });
    await bitacora.registrar({ accion: "cobrar", entidad: "factura", entidadId: "f1" });

    const soloProductos = await bitacora.listar({ entidad: "producto" });
    expect(soloProductos).toHaveLength(1);
    expect(soloProductos[0].entidad).toBe("producto");

    const hoy = new Date().toISOString().slice(0, 10);
    const porHoy = await bitacora.listar({ desde: hoy, hasta: hoy });
    expect(porHoy).toHaveLength(2);
  });

  it("por defecto queda 'confirmada' y origen 'app'", async () => {
    const bitacora = crearBitacoraRepo(db);
    const registro = await bitacora.registrar({ accion: "eliminar", entidad: "producto" });
    expect(registro.confirmada).toBe(1);
    expect(registro.origen).toBe("app");
  });
});

describe("bitácora — se registra automáticamente en acciones sensibles", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("al eliminar un producto", async () => {
    const productos = crearProductoRepo(db);
    const bitacora = crearBitacoraRepo(db);
    const p = await productos.crear({ descripcion: "Agua", costo: 10, precio_venta: 20 });

    await productos.eliminar(p.id);

    const registros = await bitacora.listar({ entidad: "producto" });
    expect(registros.some((r) => r.accion === "eliminar" && r.entidad_id === p.id)).toBe(true);
  });

  it("al eliminar un cliente", async () => {
    const clientes = crearClienteRepo(db);
    const bitacora = crearBitacoraRepo(db);
    const cl = await clientes.crear({ nombre: "Juan" });

    await clientes.eliminar(cl.id);

    const registros = await bitacora.listar({ entidad: "cliente" });
    expect(registros.some((r) => r.entidad_id === cl.id)).toBe(true);
  });

  it("al cobrar una venta", async () => {
    const facturas = crearFacturaRepo(db);
    const bitacora = crearBitacoraRepo(db);
    const t = await facturas.abrirTicket();
    await facturas.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 1,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 50 }] });

    const registros = await bitacora.listar({ entidad: "factura" });
    expect(registros.some((r) => r.accion === "cobrar" && r.entidad_id === t.id)).toBe(true);
  });
});
