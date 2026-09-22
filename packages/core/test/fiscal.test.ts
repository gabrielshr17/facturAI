import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearProveedorFiscalSimulado,
  cobrarConFiscal,
  formatearNcf,
  tipoEcfSugerido,
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

describe("dominio ecf — formato y sugerencia de tipo", () => {
  it("formatea el NCF con padding a 10 dígitos", () => {
    expect(formatearNcf("32", 1)).toBe("E320000000001");
    expect(formatearNcf("31", 42)).toBe("E310000000042");
  });

  it("sugiere E31 si hay RNC y E32 si no", () => {
    expect(tipoEcfSugerido("rnc")).toBe("31");
    expect(tipoEcfSugerido("cedula")).toBe("32");
    expect(tipoEcfSugerido(null)).toBe("32");
  });
});

describe("secuenciaNcfRepo", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crea una secuencia y consume números en orden", async () => {
    const repo = crearSecuenciaNcfRepo(db);
    const s = await repo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    expect(s.prefijo).toBe("E32");
    expect(s.estado).toBe("disponible");

    const n1 = await repo.consumirSiguiente(s.id);
    const n2 = await repo.consumirSiguiente(s.id);
    expect(n1).toBe(1);
    expect(n2).toBe(2);
  });

  it("obtenerVigente encuentra la secuencia disponible del tipo", async () => {
    const repo = crearSecuenciaNcfRepo(db);
    await repo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 10, vencimiento: hoyMasDias(30) });
    const vigente = await repo.obtenerVigente("32");
    expect(vigente).toBeDefined();
    expect(await repo.obtenerVigente("31")).toBeUndefined();
  });

  it("marca agotada cuando se consume el último número", async () => {
    const repo = crearSecuenciaNcfRepo(db);
    const s = await repo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 1, vencimiento: hoyMasDias(30) });
    await repo.consumirSiguiente(s.id);
    expect(await repo.obtenerVigente("32")).toBeUndefined();
    await expect(repo.consumirSiguiente(s.id)).rejects.toBeInstanceOf(ValidacionError);
  });

  it("marca vencida si la fecha ya pasó, y no la ofrece como vigente", async () => {
    const repo = crearSecuenciaNcfRepo(db);
    await repo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(-1) });
    expect(await repo.obtenerVigente("32")).toBeUndefined();
    const [listada] = await repo.listar();
    expect(listada.estado).toBe("vencida");
  });

  it("rechaza rango inválido", async () => {
    const repo = crearSecuenciaNcfRepo(db);
    await expect(
      repo.crear({ tipoEcf: "32", rangoDesde: 10, rangoHasta: 5, vencimiento: hoyMasDias(30) }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });
});

describe("cobrarConFiscal — flujo completo con proveedor simulado", () => {
  let db: SqlDriver;
  let proveedor: ProveedorFiscal;

  beforeEach(async () => {
    db = await nuevaDb();
    proveedor = crearProveedorFiscalSimulado();
  });

  function deps() {
    return {
      facturaRepo: crearFacturaRepo(db),
      secuenciaRepo: crearSecuenciaNcfRepo(db),
      comprobanteRepo: crearComprobanteFiscalRepo(db),
      proveedorFiscal: proveedor,
    };
  }

  async function ticketCon100(facturaRepo: ReturnType<typeof crearFacturaRepo>) {
    const t = await facturaRepo.abrirTicket();
    await facturaRepo.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 2,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    return t;
  }

  it("emite E32 (consumo) sin RNC del receptor", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticketCon100(d.facturaRepo);

    const { factura, comprobante, cambio } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 100 }],
      tipoEcf: "32",
      rncEmisor: "101023122",
    });

    expect(factura.estado).toBe("cobrada");
    expect(factura.tipo).toBe("fiscal");
    expect(factura.comprobante_id).toBe(comprobante.id);
    expect(comprobante.ncf).toBe("E320000000001");
    expect(comprobante.estado_dgii).toBe("aceptado");
    expect(cambio).toBe(0);
  });

  it("emite E31 (crédito fiscal) exigiendo RNC del receptor", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "31", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticketCon100(d.facturaRepo);

    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 100 }], tipoEcf: "31", rncEmisor: "101023122" }),
    ).rejects.toBeInstanceOf(ValidacionError);

    const { comprobante } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 100 }],
      tipoEcf: "31",
      receptorDocumentoTipo: "rnc",
      receptorDocumentoNumero: "101023122",
      rncEmisor: "101023122",
    });
    expect(comprobante.ncf).toBe("E310000000001");
  });

  it("rechaza RNC del receptor con formato inválido", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "31", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticketCon100(d.facturaRepo);
    await expect(
      cobrarConFiscal(d, t.id, {
        pagos: [{ metodo: "efectivo", monto: 100 }],
        tipoEcf: "31",
        receptorDocumentoTipo: "rnc",
        receptorDocumentoNumero: "111111111",
        rncEmisor: "101023122",
      }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("bloquea si no hay secuencia vigente configurada (sin consumir nada)", async () => {
    const d = deps();
    const t = await ticketCon100(d.facturaRepo);
    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 100 }], tipoEcf: "32", rncEmisor: null }),
    ).rejects.toBeInstanceOf(ValidacionError);
    // El ticket sigue abierto: no se tocó nada.
    expect((await d.facturaRepo.obtener(t.id))?.estado).toBe("abierta");
  });

  it("bloquea si el pago es insuficiente y NO consume número de la secuencia", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticketCon100(d.facturaRepo);

    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 10 }], tipoEcf: "32", rncEmisor: null }),
    ).rejects.toBeInstanceOf(ValidacionError);

    const vigente = await d.secuenciaRepo.obtenerVigente("32");
    expect(vigente?.proximo_numero).toBe(1); // no se consumió ningún número
  });

  it("política de contingencia: si la DGII rechaza, no cobra ni marca fiscal", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticketCon100(d.facturaRepo);

    const proveedorQueRechaza: ProveedorFiscal = {
      async transmitir() {
        return { estado: "rechazado", motivoRechazo: "RNC emisor no habilitado" };
      },
    };

    await expect(
      cobrarConFiscal({ ...d, proveedorFiscal: proveedorQueRechaza }, t.id, {
        pagos: [{ metodo: "efectivo", monto: 100 }],
        tipoEcf: "32",
        rncEmisor: "101023122",
      }),
    ).rejects.toBeInstanceOf(ValidacionError);

    const factura = await d.facturaRepo.obtener(t.id);
    expect(factura?.estado).toBe("abierta"); // no se cobró
    expect(factura?.tipo).toBe("normal"); // no se marcó fiscal
  });
});
