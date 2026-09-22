import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearCompraRepo,
  crearProductoRepo,
  crearProveedorRepo,
  crearNegocioRepo,
  crearMovimientoInventarioRepo,
  ValidacionError,
} from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("proveedorRepo — CRUD", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crea, actualiza y busca por nombre", async () => {
    const proveedores = crearProveedorRepo(db);
    const p = await proveedores.crear({ nombre: "Distribuidora ABC", rnc: "130123456" });
    expect(p.nombre).toBe("Distribuidora ABC");

    await proveedores.actualizar(p.id, { nombre: "Distribuidora ABC", telefono: "809-555-1111" });
    const actualizado = await proveedores.obtener(p.id);
    expect(actualizado?.telefono).toBe("809-555-1111");

    const encontrados = await proveedores.listar("abc");
    expect(encontrados.map((x) => x.id)).toContain(p.id);
  });

  it("rechaza un proveedor sin nombre", async () => {
    const proveedores = crearProveedorRepo(db);
    await expect(proveedores.crear({ nombre: "" })).rejects.toBeInstanceOf(ValidacionError);
  });
});

describe("compraRepo — registrar compra (§ Compras e inventario)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("registra la compra, calcula totales y guarda las líneas", async () => {
    const compras = crearCompraRepo(db);
    const compra = await compras.crear({
      fecha: "2026-07-15T10:00:00.000Z",
      lineas: [
        { descripcion: "Arroz 5lb", cantidad: 10, costoUnitario: 40, impuestoTipo: "itbis18", tasaImpuesto: 0.18 },
        { descripcion: "Pan", cantidad: 5, costoUnitario: 15, impuestoTipo: "exento", tasaImpuesto: 0 },
      ],
    });

    expect(compra.mes_ano_contable).toBe("2026-07");
    expect(compra.total).toBe(475); // 400 + 75
    expect(compra.estado_clasificacion).toBe("sin_fiscal");

    const lineas = await compras.obtenerLineas(compra.id);
    expect(lineas).toHaveLength(2);
    expect(lineas.reduce((s, l) => s + l.subtotal, 0)).toBeCloseTo(475, 2);
  });

  it("marca 'con_fiscal' cuando se indica que tiene comprobante fiscal", async () => {
    const compras = crearCompraRepo(db);
    const compra = await compras.crear({
      tieneComprobanteFiscal: true,
      ncf_proveedor: "B0100000001",
      lineas: [
        { descripcion: "Detergente", cantidad: 1, costoUnitario: 100, impuestoTipo: "itbis18", tasaImpuesto: 0.18 },
      ],
    });
    expect(compra.estado_clasificacion).toBe("con_fiscal");
    expect(compra.tiene_comprobante_fiscal).toBe(1);
  });

  it("rechaza una compra sin líneas", async () => {
    const compras = crearCompraRepo(db);
    await expect(compras.crear({ lineas: [] })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("actualiza el costo del producto SIEMPRE, con inventario apagado o activo", async () => {
    const productos = crearProductoRepo(db);
    const compras = crearCompraRepo(db);
    const p = await productos.crear({ descripcion: "Arroz 5lb", costo: 35, precio_venta: 50 });

    await compras.crear({
      lineas: [
        {
          producto_id: p.id,
          descripcion: "Arroz 5lb",
          cantidad: 20,
          costoUnitario: 42,
          impuestoTipo: "itbis18",
          tasaImpuesto: 0.18,
        },
      ],
    });

    const actualizado = await productos.obtener(p.id);
    expect(actualizado?.costo).toBe(42);
    expect(actualizado?.existencia).toBeNull(); // inventario apagado: no se toca la existencia
  });

  it("con inventario activo, incrementa existencia y registra el movimiento 'compra'", async () => {
    const negocioRepo = crearNegocioRepo(db);
    await negocioRepo.guardar({ nombre_comercial: "Test", inventario_activo: true });

    const productos = crearProductoRepo(db);
    const compras = crearCompraRepo(db);
    const movimientos = crearMovimientoInventarioRepo(db);
    const p = await productos.crear({ descripcion: "Arroz 5lb", costo: 35, precio_venta: 50 });
    await productos.ajustarExistencia(p.id, 5);

    const compra = await compras.crear({
      lineas: [
        {
          producto_id: p.id,
          descripcion: "Arroz 5lb",
          cantidad: 20,
          costoUnitario: 42,
          impuestoTipo: "itbis18",
          tasaImpuesto: 0.18,
        },
      ],
    });

    const actualizado = await productos.obtener(p.id);
    expect(actualizado?.existencia).toBe(25);

    const historial = await movimientos.listarPorProducto(p.id);
    const entrada = historial.find((m) => m.tipo === "compra");
    expect(entrada?.cantidad).toBe(20);
    expect(entrada?.referencia_id).toBe(compra.id);
  });

  it("no afecta inventario para líneas de productos nuevos (sin producto_id)", async () => {
    const negocioRepo = crearNegocioRepo(db);
    await negocioRepo.guardar({ nombre_comercial: "Test", inventario_activo: true });
    const compras = crearCompraRepo(db);
    await expect(
      compras.crear({
        lineas: [
          {
            producto_id: null,
            descripcion: "Artículo nuevo",
            cantidad: 1,
            costoUnitario: 10,
            impuestoTipo: "itbis18",
            tasaImpuesto: 0.18,
          },
        ],
      }),
    ).resolves.toBeDefined();
  });

  it("filtra el listado por período y proveedor", async () => {
    const proveedores = crearProveedorRepo(db);
    const compras = crearCompraRepo(db);
    const prov1 = await proveedores.crear({ nombre: "Proveedor 1" });
    const prov2 = await proveedores.crear({ nombre: "Proveedor 2" });

    const c1 = await compras.crear({
      fecha: "2026-07-01T10:00:00.000Z",
      proveedor_id: prov1.id,
      lineas: [{ descripcion: "X", cantidad: 1, costoUnitario: 10, impuestoTipo: "itbis18", tasaImpuesto: 0.18 }],
    });
    await compras.crear({
      fecha: "2026-06-01T10:00:00.000Z",
      proveedor_id: prov2.id,
      lineas: [{ descripcion: "Y", cantidad: 1, costoUnitario: 10, impuestoTipo: "itbis18", tasaImpuesto: 0.18 }],
    });

    const porProveedor = await compras.listar({ proveedorId: prov1.id });
    expect(porProveedor.map((c) => c.id)).toEqual([c1.id]);

    const porPeriodo = await compras.listar({ desde: "2026-07-01", hasta: "2026-07-31" });
    expect(porPeriodo.map((c) => c.id)).toEqual([c1.id]);
  });
});
