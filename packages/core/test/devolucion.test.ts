import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearFacturaRepo,
  crearProductoRepo,
  crearNegocioRepo,
  crearMovimientoInventarioRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearProveedorFiscalSimulado,
  crearDevolucionRepo,
  cobrarConFiscal,
  registrarDevolucionConFiscal,
  ValidacionError,
  type ProveedorFiscal,
} from "../src/index.js";

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

async function ventaCobrada(facturas: ReturnType<typeof crearFacturaRepo>) {
  const t = await facturas.abrirTicket();
  const linea = await facturas.agregarLinea(t.id, {
    descripcion: "Arroz",
    cantidad: 3,
    precioUnitario: 50,
    impuestoTipo: "itbis18",
    tasaImpuesto: 0.18,
  });
  await facturas.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 150 }] });
  return { facturaId: t.id, lineaId: linea.id };
}

describe("devolucionRepo — sin comprobante fiscal", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("registra una devolución parcial y calcula el total", async () => {
    const facturas = crearFacturaRepo(db);
    const devoluciones = crearDevolucionRepo(db);
    const { facturaId, lineaId } = await ventaCobrada(facturas);

    const d = await devoluciones.crear({
      facturaId,
      motivo: "Producto dañado",
      lineas: [{ facturaLineaId: lineaId, cantidad: 1 }],
    });

    expect(d.total).toBe(50);
    const lineas = await devoluciones.obtenerLineas(d.id);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].cantidad).toBe(1);
  });

  it("rechaza devolver de una factura que no está cobrada", async () => {
    const facturas = crearFacturaRepo(db);
    const devoluciones = crearDevolucionRepo(db);
    const t = await facturas.abrirTicket();
    const linea = await facturas.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 1,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });

    await expect(
      devoluciones.crear({ facturaId: t.id, lineas: [{ facturaLineaId: linea.id, cantidad: 1 }] }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("rechaza devolver más cantidad de la que se vendió (acumulado entre varias devoluciones)", async () => {
    const facturas = crearFacturaRepo(db);
    const devoluciones = crearDevolucionRepo(db);
    const { facturaId, lineaId } = await ventaCobrada(facturas);

    await devoluciones.crear({ facturaId, lineas: [{ facturaLineaId: lineaId, cantidad: 2 }] });
    await expect(
      devoluciones.crear({ facturaId, lineas: [{ facturaLineaId: lineaId, cantidad: 2 }] }),
    ).rejects.toBeInstanceOf(ValidacionError); // ya se devolvieron 2 de 3, solo queda 1
  });

  it("con inventario activo, restituye existencia y registra el movimiento 'entrada'", async () => {
    await crearNegocioRepo(db).guardar({ nombre_comercial: "Test", inventario_activo: true });
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const devoluciones = crearDevolucionRepo(db);
    const movimientos = crearMovimientoInventarioRepo(db);

    const p = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 50 });
    await productos.ajustarExistencia(p.id, 10);

    const t = await facturas.abrirTicket();
    const linea = await facturas.agregarLinea(t.id, {
      producto_id: p.id,
      descripcion: "Arroz",
      cantidad: 3,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 150 }] });
    // existencia ahora 7 (10 - 3 vendidas)

    await devoluciones.crear({ facturaId: t.id, lineas: [{ facturaLineaId: linea.id, cantidad: 2 }] });

    const actualizado = await productos.obtener(p.id);
    expect(actualizado?.existencia).toBe(9); // 7 + 2 devueltas

    const historial = await movimientos.listarPorProducto(p.id);
    expect(historial.some((m) => m.tipo === "entrada" && m.cantidad === 2)).toBe(true);
  });

  it("no restituye existencia si el inventario está apagado", async () => {
    const productos = crearProductoRepo(db);
    const facturas = crearFacturaRepo(db);
    const devoluciones = crearDevolucionRepo(db);
    const p = await productos.crear({ descripcion: "Arroz", costo: 30, precio_venta: 50 });

    const t = await facturas.abrirTicket();
    const linea = await facturas.agregarLinea(t.id, {
      producto_id: p.id,
      descripcion: "Arroz",
      cantidad: 3,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 150 }] });

    await devoluciones.crear({ facturaId: t.id, lineas: [{ facturaLineaId: linea.id, cantidad: 1 }] });

    expect((await productos.obtener(p.id))?.existencia).toBeNull();
  });
});

describe("registrarDevolucionConFiscal — exige Nota de Crédito (E34)", () => {
  let db: SqlDriver;
  let proveedor: ProveedorFiscal;
  beforeEach(async () => {
    db = await nuevaDb();
    proveedor = crearProveedorFiscalSimulado();
  });

  function deps() {
    return {
      devolucionRepo: crearDevolucionRepo(db),
      facturaRepo: crearFacturaRepo(db),
      secuenciaRepo: crearSecuenciaNcfRepo(db),
      comprobanteRepo: crearComprobanteFiscalRepo(db),
      proveedorFiscal: proveedor,
    };
  }

  it("emite la NC E34 y completa la devolución", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    await d.secuenciaRepo.crear({ tipoEcf: "34", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });

    const t = await d.facturaRepo.abrirTicket();
    const linea = await d.facturaRepo.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 2,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 100 }],
      tipoEcf: "32",
      rncEmisor: "101023122",
    });

    const { devolucion, comprobante } = await registrarDevolucionConFiscal(
      d,
      { facturaId: t.id, lineas: [{ facturaLineaId: linea.id, cantidad: 1 }] },
      "101023122",
    );

    expect(comprobante.tipo_ecf).toBe("34");
    expect(comprobante.ncf).toBe("E340000000001");
    expect(devolucion.comprobante_id).toBe(comprobante.id);
    expect(devolucion.total).toBe(50);
  });

  it("rechaza si la venta original no tiene comprobante fiscal", async () => {
    const d = deps();
    const t = await d.facturaRepo.abrirTicket();
    const linea = await d.facturaRepo.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 1,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await d.facturaRepo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 50 }] }); // venta normal, sin NCF

    await expect(
      registrarDevolucionConFiscal(
        d,
        { facturaId: t.id, lineas: [{ facturaLineaId: linea.id, cantidad: 1 }] },
        "101023122",
      ),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("bloquea si no hay secuencia E34 configurada, sin consumirla de otro tipo", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });

    const t = await d.facturaRepo.abrirTicket();
    const linea = await d.facturaRepo.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 1,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 50 }],
      tipoEcf: "32",
      rncEmisor: "101023122",
    });

    await expect(
      registrarDevolucionConFiscal(
        d,
        { facturaId: t.id, lineas: [{ facturaLineaId: linea.id, cantidad: 1 }] },
        "101023122",
      ),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("si la DGII rechaza la NC, no completa la devolución (nada se restituye)", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    await d.secuenciaRepo.crear({ tipoEcf: "34", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });

    const t = await d.facturaRepo.abrirTicket();
    const linea = await d.facturaRepo.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 1,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 50 }],
      tipoEcf: "32",
      rncEmisor: "101023122",
    });

    const proveedorQueRechaza: ProveedorFiscal = {
      async transmitir() {
        return { estado: "rechazado", motivoRechazo: "prueba" };
      },
    };

    await expect(
      registrarDevolucionConFiscal(
        { ...d, proveedorFiscal: proveedorQueRechaza },
        { facturaId: t.id, lineas: [{ facturaLineaId: linea.id, cantidad: 1 }] },
        "101023122",
      ),
    ).rejects.toBeInstanceOf(ValidacionError);

    const devolucionRepo = crearDevolucionRepo(db);
    expect(await devolucionRepo.listarPorFactura(t.id)).toHaveLength(0);
  });
});
