import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearNcfAnulacionRepo,
  crearProveedorFiscalSimulado,
  cobrarConFiscal,
  exoneraItbis,
  formatearNcf,
  requiereCompradorIdentificado,
  tipoEcfSugerido,
  type TipoEcf,
  ValidacionError,
  type ProveedorFiscal,
  type EmisorFiscal,
  type ComprobanteATransmitir,
} from "../src/index.js";

const EMISOR: EmisorFiscal = {
  rnc: "131880738",
  razonSocial: "SUPLIDORA MAROHI SRL",
  nombreComercial: "Suplidora Marohi",
  direccion: "Calle Principal #1, Santo Domingo",
};

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

  it("solo los E44 y E46 exoneran de ITBIS y exigen comprador identificado", () => {
    expect(
      ["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"].filter((t) => exoneraItbis(t as TipoEcf)),
    ).toEqual(["44", "46"]);
    expect(requiereCompradorIdentificado("44")).toBe(true);
    expect(requiereCompradorIdentificado("46")).toBe(true);
    expect(requiereCompradorIdentificado("32")).toBe(false);
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

  it("cerrar deja de ofrecer los números sin usar y respeta los ya consumidos", async () => {
    const repo = crearSecuenciaNcfRepo(db);
    const vieja = await repo.crear({ tipoEcf: "31", rangoDesde: 1, rangoHasta: 10, vencimiento: hoyMasDias(100) });
    await repo.consumirSiguiente(vieja.id);
    await repo.consumirSiguiente(vieja.id);
    const nueva = await repo.crear({ tipoEcf: "31", rangoDesde: 100, rangoHasta: 110, vencimiento: hoyMasDias(900) });
    expect((await repo.obtenerVigente("31"))?.id).toBe(vieja.id);

    await repo.cerrar(vieja.id);

    const cerrada = await repo.obtener(vieja.id);
    expect(cerrada).toMatchObject({ rango_desde: 1, rango_hasta: 2, proximo_numero: 3, estado: "agotada" });
    await expect(repo.consumirSiguiente(vieja.id)).rejects.toBeInstanceOf(ValidacionError);
    expect((await repo.obtenerVigente("31"))?.id).toBe(nueva.id);
    expect(await repo.consumirSiguiente(nueva.id)).toBe(100);
  });

  it("cerrar una secuencia sin uso la deja agotada y una inexistente se rechaza", async () => {
    const repo = crearSecuenciaNcfRepo(db);
    const s = await repo.crear({ tipoEcf: "32", rangoDesde: 5, rangoHasta: 9, vencimiento: hoyMasDias(30) });
    await repo.cerrar(s.id);
    expect(await repo.obtenerVigente("32")).toBeUndefined();
    expect((await repo.obtener(s.id))?.estado).toBe("agotada");
    await expect(repo.cerrar("no-existe")).rejects.toThrow();
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
      anulacionRepo: crearNcfAnulacionRepo(db),
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
      emisor: EMISOR,
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
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 100 }], tipoEcf: "31", emisor: EMISOR }),
    ).rejects.toBeInstanceOf(ValidacionError);

    const { comprobante } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 100 }],
      tipoEcf: "31",
      receptorDocumentoTipo: "rnc",
      receptorDocumentoNumero: "101023122",
      receptorNombre: "CLIENTE EJEMPLO SRL",
      emisor: EMISOR,
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
        emisor: EMISOR,
      }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("bloquea si no hay secuencia vigente configurada (sin consumir nada)", async () => {
    const d = deps();
    const t = await ticketCon100(d.facturaRepo);
    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 100 }], tipoEcf: "32", emisor: EMISOR }),
    ).rejects.toBeInstanceOf(ValidacionError);
    // El ticket sigue abierto: no se tocó nada.
    expect((await d.facturaRepo.obtener(t.id))?.estado).toBe("abierta");
  });

  it("bloquea si el pago es insuficiente y NO consume número de la secuencia", async () => {
    const d = deps();
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticketCon100(d.facturaRepo);

    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 10 }], tipoEcf: "32", emisor: EMISOR }),
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
        emisor: EMISOR,
      }),
    ).rejects.toBeInstanceOf(ValidacionError);

    const factura = await d.facturaRepo.obtener(t.id);
    expect(factura?.estado).toBe("abierta"); // no se cobró
    expect(factura?.tipo).toBe("normal"); // no se marcó fiscal
  });
});

describe("cobrarConFiscal — E44 y E46 (ticket exonerado de ITBIS)", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  function depsConEspia(transmitidos: ComprobanteATransmitir[], rechaza = false) {
    const proveedorFiscal: ProveedorFiscal = {
      async transmitir(comprobante) {
        transmitidos.push(comprobante);
        return rechaza
          ? { estado: "rechazado", motivoRechazo: "prueba" }
          : { estado: "aceptado", trackId: "T-1", codigoSeguridad: "ABC123" };
      },
    };
    return {
      facturaRepo: crearFacturaRepo(db),
      secuenciaRepo: crearSecuenciaNcfRepo(db),
      comprobanteRepo: crearComprobanteFiscalRepo(db),
      anulacionRepo: crearNcfAnulacionRepo(db),
      proveedorFiscal,
    };
  }

  async function ticketGravado(facturaRepo: ReturnType<typeof crearFacturaRepo>) {
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

  const comprador = {
    receptorDocumentoTipo: "rnc" as const,
    receptorDocumentoNumero: "101023122",
    receptorNombre: "CLIENTE EXENTO SRL",
  };

  for (const tipo of ["44", "46"] as const) {
    it(`E${tipo}: mantiene el total, transmite todo sin ITBIS y deja el ticket exento`, async () => {
      const transmitidos: ComprobanteATransmitir[] = [];
      const d = depsConEspia(transmitidos);
      await d.secuenciaRepo.crear({ tipoEcf: tipo, rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
      const t = await ticketGravado(d.facturaRepo);
      const antes = await d.facturaRepo.obtener(t.id);
      expect(antes?.total_itbis).toBeGreaterThan(0);

      const { factura, comprobante } = await cobrarConFiscal(d, t.id, {
        pagos: [{ metodo: "efectivo", monto: 100 }],
        tipoEcf: tipo,
        ...comprador,
        emisor: EMISOR,
      });

      const [enviado] = transmitidos;
      expect(enviado?.lineas.map((l) => l.tasaImpuesto)).toEqual([0]);
      expect(enviado?.lineas[0]?.subtotal).toBe(100);
      expect(enviado).toMatchObject({ montoGravado: 0, montoExento: 100, montoItbis: 0, total: 100 });
      expect(factura).toMatchObject({ estado: "cobrada", total: 100, total_itbis: 0, subtotal_gravado: 0 });
      expect(factura.subtotal_exento).toBe(100);
      expect(comprobante).toMatchObject({ monto_itbis: 0, monto_gravado: 0, monto_exento: 100, total: 100 });
      const lineas = await d.facturaRepo.obtenerLineas(t.id);
      expect(lineas.map((l) => [l.tasa_impuesto, l.monto_itbis, l.subtotal])).toEqual([[0, 0, 100]]);
    });

    it(`E${tipo}: exige comprador identificado y no consume número ni toca el ticket`, async () => {
      const transmitidos: ComprobanteATransmitir[] = [];
      const d = depsConEspia(transmitidos);
      await d.secuenciaRepo.crear({ tipoEcf: tipo, rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
      const t = await ticketGravado(d.facturaRepo);

      await expect(
        cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 100 }], tipoEcf: tipo, emisor: EMISOR }),
      ).rejects.toBeInstanceOf(ValidacionError);

      expect(transmitidos).toEqual([]);
      expect((await d.secuenciaRepo.obtenerVigente(tipo))?.proximo_numero).toBe(1);
      const factura = await d.facturaRepo.obtener(t.id);
      expect(factura?.total_itbis).toBeGreaterThan(0);
    });

    it(`E${tipo}: si la DGII lo rechaza, el ticket conserva su ITBIS original`, async () => {
      const transmitidos: ComprobanteATransmitir[] = [];
      const d = depsConEspia(transmitidos, true);
      await d.secuenciaRepo.crear({ tipoEcf: tipo, rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
      const t = await ticketGravado(d.facturaRepo);
      const antes = await d.facturaRepo.obtener(t.id);

      await expect(
        cobrarConFiscal(d, t.id, {
          pagos: [{ metodo: "efectivo", monto: 100 }],
          tipoEcf: tipo,
          ...comprador,
          emisor: EMISOR,
        }),
      ).rejects.toBeInstanceOf(ValidacionError);

      const despues = await d.facturaRepo.obtener(t.id);
      expect(despues).toMatchObject({ estado: "abierta", total: antes?.total, total_itbis: antes?.total_itbis });
      const lineas = await d.facturaRepo.obtenerLineas(t.id);
      expect(lineas.map((l) => l.tasa_impuesto)).toEqual([0.18]);
    });
  }
});
