import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearNcfAnulacionRepo,
  crearDevolucionRepo,
  cobrarConFiscal,
  registrarDevolucionConFiscal,
  emitirNotaDebitoFiscal,
  reconciliarComprobantesPendientes,
  anularNcfPendientes,
  ValidacionError,
  type ProveedorFiscal,
  type ComprobanteATransmitir,
  type ResultadoTransmision,
  type EstadoTransmision,
  type EmisorFiscal,
} from "../src/index.js";

const EMISOR: EmisorFiscal = {
  rnc: "131880738",
  razonSocial: "SUPLIDORA MAROHI SRL",
  nombreComercial: "Suplidora Marohi",
  direccion: "Calle Principal #1, Santo Domingo",
};

const ACEPTADO: ResultadoTransmision = {
  estado: "aceptado",
  codigoSeguridad: "AbC123",
  fechaFirma: "01-10-2026 14:31:05",
  qrUrl: "https://fc.dgii.gov.do/testecf/consultatimbrefc?encf=E320000000001",
  xmlFirmado: "<ECF>firmado</ECF>",
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

function proveedorQueResponde(resultado: ResultadoTransmision) {
  const recibidos: ComprobanteATransmitir[] = [];
  const proveedor: ProveedorFiscal = {
    async transmitir(c) {
      recibidos.push(c);
      return resultado;
    },
  };
  return { proveedor, recibidos };
}

function depsCon(db: SqlDriver, proveedorFiscal: ProveedorFiscal) {
  return {
    facturaRepo: crearFacturaRepo(db),
    secuenciaRepo: crearSecuenciaNcfRepo(db),
    comprobanteRepo: crearComprobanteFiscalRepo(db),
    anulacionRepo: crearNcfAnulacionRepo(db),
    devolucionRepo: crearDevolucionRepo(db),
    proveedorFiscal,
  };
}

async function ticket(facturaRepo: ReturnType<typeof crearFacturaRepo>, precio = 118, cantidad = 1) {
  const t = await facturaRepo.abrirTicket();
  const linea = await facturaRepo.agregarLinea(t.id, {
    descripcion: "Arroz Selecto",
    cantidad,
    precioUnitario: precio,
    impuestoTipo: "itbis18",
    tasaImpuesto: 0.18,
  });
  return { ...t, lineaId: linea.id };
}

describe("cobrarConFiscal — integración con la DGII", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("envía al proveedor líneas, pagos, emisor y vencimiento de la secuencia", async () => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: "2027-12-31" });
    const t = await ticket(d.facturaRepo, 118, 2);

    await cobrarConFiscal(d, t.id, { pagos: [{ metodo: "tarjeta", monto: 236 }], tipoEcf: "32", emisor: EMISOR });

    const [enviado] = recibidos;
    expect(enviado).toBeDefined();
    expect(enviado?.emisor).toEqual(EMISOR);
    expect(enviado?.fechaVencimientoSecuencia).toBe("2027-12-31");
    expect(enviado?.lineas).toEqual([
      { descripcion: "Arroz Selecto", cantidad: 2, precioUnitario: 118, tasaImpuesto: 0.18, subtotal: 236 },
    ]);
    expect(enviado?.pagos).toEqual([{ metodo: "tarjeta", monto: 236 }]);
    expect(enviado?.referencia).toBeNull();
    expect(enviado?.total).toBe(236);
  });

  it("envía lo pagado neto del cambio: el efectivo entregado de más no cuenta como pago", async () => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo, 100);

    const { cambio } = await cobrarConFiscal(d, t.id, {
      pagos: [
        { metodo: "tarjeta", monto: 40 },
        { metodo: "efectivo", monto: 500 },
      ],
      tipoEcf: "32",
      emisor: EMISOR,
    });

    expect(cambio).toBe(440);
    expect(recibidos[0]?.pagos).toEqual([
      { metodo: "tarjeta", monto: 40 },
      { metodo: "efectivo", monto: 60 },
    ]);
  });

  it("guarda código de seguridad, QR, fecha de firma y XML firmado", async () => {
    const { proveedor } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo);

    const { comprobante } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 118 }],
      tipoEcf: "32",
      emisor: EMISOR,
    });

    const guardado = await d.comprobanteRepo.obtener(comprobante.id);
    expect(guardado?.codigo_seguridad).toBe("AbC123");
    expect(guardado?.qr_url).toBe(ACEPTADO.qrUrl);
    expect(guardado?.fecha_firma).toBe("01-10-2026 14:31:05");
    expect(guardado?.xml_firmado).toBe("<ECF>firmado</ECF>");
  });

  it("aceptado condicional tiene validez fiscal: cobra y lo registra así", async () => {
    const { proveedor } = proveedorQueResponde({ ...ACEPTADO, estado: "aceptado_condicional" });
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo);

    const { factura, comprobante } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 118 }],
      tipoEcf: "32",
      emisor: EMISOR,
    });

    expect(factura.estado).toBe("cobrada");
    expect(comprobante.estado_dgii).toBe("aceptado_condicional");
  });

  it("en proceso: la DGII ya recibió el e-CF, se cobra y queda pendiente con su trackId", async () => {
    const { proveedor } = proveedorQueResponde({ ...ACEPTADO, estado: "en_proceso", trackId: "track-31" });
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "31", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo);

    const { factura, comprobante } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 118 }],
      tipoEcf: "31",
      receptorDocumentoTipo: "rnc",
      receptorDocumentoNumero: "101023122",
      receptorNombre: "CLIENTE EJEMPLO SRL",
      emisor: EMISOR,
    });

    expect(factura.estado).toBe("cobrada");
    expect(comprobante.estado_dgii).toBe("pendiente");
    expect(comprobante.track_id_dgii).toBe("track-31");
  });

  it("exige datos completos del emisor antes de consumir un número", async () => {
    const { proveedor } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo);

    for (const emisor of [null, { ...EMISOR, direccion: "  " }, { ...EMISOR, rnc: "" }]) {
      await expect(
        cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 118 }], tipoEcf: "32", emisor }),
      ).rejects.toBeInstanceOf(ValidacionError);
    }
    expect((await d.secuenciaRepo.obtenerVigente("32"))?.proximo_numero).toBe(1);
  });

  it("el E31 exige la razón social del comprador", async () => {
    const { proveedor } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "31", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo);

    await expect(
      cobrarConFiscal(d, t.id, {
        pagos: [{ metodo: "efectivo", monto: 118 }],
        tipoEcf: "31",
        receptorDocumentoTipo: "rnc",
        receptorDocumentoNumero: "101023122",
        emisor: EMISOR,
      }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  describe("Gubernamental (E45)", () => {
    const COMPRADOR = {
      receptorDocumentoTipo: "rnc" as const,
      receptorDocumentoNumero: "101023122",
      receptorNombre: "MINISTERIO EJEMPLO",
    };

    async function depsConSecuenciaE45(proveedor: ProveedorFiscal) {
      const d = depsCon(db, proveedor);
      await d.secuenciaRepo.crear({ tipoEcf: "45", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
      return d;
    }

    it("exige RNC y razón social del comprador, sin consumir número", async () => {
      const d = await depsConSecuenciaE45(proveedorQueResponde(ACEPTADO).proveedor);
      const t = await ticket(d.facturaRepo);
      const pagos = [{ metodo: "efectivo" as const, monto: 118 }];

      await expect(
        cobrarConFiscal(d, t.id, { pagos, tipoEcf: "45", receptorNombre: "MINISTERIO EJEMPLO", emisor: EMISOR }),
      ).rejects.toBeInstanceOf(ValidacionError);
      await expect(
        cobrarConFiscal(d, t.id, {
          pagos,
          tipoEcf: "45",
          receptorDocumentoTipo: "rnc",
          receptorDocumentoNumero: "101023122",
          emisor: EMISOR,
        }),
      ).rejects.toBeInstanceOf(ValidacionError);
      expect((await d.secuenciaRepo.obtenerVigente("45"))?.proximo_numero).toBe(1);
    });

    it("transmite el E45 con su secuencia, el comprador y el vencimiento", async () => {
      const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
      const d = await depsConSecuenciaE45(proveedor);
      const t = await ticket(d.facturaRepo);

      const { comprobante } = await cobrarConFiscal(d, t.id, {
        pagos: [{ metodo: "efectivo", monto: 118 }],
        tipoEcf: "45",
        ...COMPRADOR,
        emisor: EMISOR,
      });

      const enviado = recibidos.at(-1);
      expect(enviado?.tipoEcf).toBe("45");
      expect(enviado?.ncf).toBe("E450000000001");
      expect(enviado?.receptorDocumentoNumero).toBe("101023122");
      expect(enviado?.receptorNombre).toBe("MINISTERIO EJEMPLO");
      expect(enviado?.fechaVencimientoSecuencia).toBe(hoyMasDias(365));
      expect(comprobante.tipo_ecf).toBe("45");
      expect(comprobante.estado_dgii).toBe("aceptado");
    });

    it("queda pendiente de entrega al comprador, como el E31", async () => {
      const d = await depsConSecuenciaE45(proveedorQueResponde(ACEPTADO).proveedor);
      const t = await ticket(d.facturaRepo);

      const { comprobante } = await cobrarConFiscal(d, t.id, {
        pagos: [{ metodo: "efectivo", monto: 118 }],
        tipoEcf: "45",
        ...COMPRADOR,
        emisor: EMISOR,
      });

      expect(comprobante.entrega_estado).toBe("pendiente");
    });
  });

  it("un consumo de RD$250,000 o más exige RNC o cédula del comprador, sin consumir número", async () => {
    const { proveedor } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo, 250000);

    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "transferencia", monto: 250000 }], tipoEcf: "32", emisor: EMISOR }),
    ).rejects.toBeInstanceOf(ValidacionError);
    expect((await d.secuenciaRepo.obtenerVigente("32"))?.proximo_numero).toBe(1);
  });

  it("si la DGII rechaza, el número consumido queda en cola para anular", async () => {
    const { proveedor } = proveedorQueResponde({ estado: "rechazado", motivoRechazo: "Monto no cuadra" });
    const d = depsCon(db, proveedor);
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo);

    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 118 }], tipoEcf: "32", emisor: EMISOR }),
    ).rejects.toBeInstanceOf(ValidacionError);

    const pendientes = await d.anulacionRepo.listarPendientes();
    expect(pendientes.map((p) => [p.tipo_ecf, p.ncf])).toEqual([["32", "E320000000001"]]);
    expect(pendientes[0]?.motivo).toContain("Monto no cuadra");
  });

  it("si no hay conexión con la DGII, el número consumido queda en cola para anular", async () => {
    const d = depsCon(db, {
      async transmitir() {
        throw new Error("sin red");
      },
    });
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo);

    await expect(
      cobrarConFiscal(d, t.id, { pagos: [{ metodo: "efectivo", monto: 118 }], tipoEcf: "32", emisor: EMISOR }),
    ).rejects.toBeInstanceOf(ValidacionError);

    expect((await d.anulacionRepo.listarPendientes()).map((p) => p.ncf)).toEqual(["E320000000001"]);
    expect((await d.facturaRepo.obtener(t.id))?.estado).toBe("abierta");
  });
});

describe("registrarDevolucionConFiscal — nota de crédito E34 hacia la DGII", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function ventaFiscal(d: ReturnType<typeof depsCon>, cantidad: number) {
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    await d.secuenciaRepo.crear({ tipoEcf: "34", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    const t = await ticket(d.facturaRepo, 118, cantidad);
    const { comprobante } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 118 * cantidad }],
      tipoEcf: "32",
      emisor: EMISOR,
    });
    return { facturaId: t.id, lineaId: t.lineaId, comprobante };
  }

  it("referencia el e-CF original y corrige montos en una devolución parcial", async () => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    const venta = await ventaFiscal(d, 2);

    await registrarDevolucionConFiscal(
      d,
      { facturaId: venta.facturaId, lineas: [{ facturaLineaId: venta.lineaId, cantidad: 1 }], motivo: "Dañado" },
      EMISOR,
    );

    const nota = recibidos.at(-1);
    expect(nota?.tipoEcf).toBe("34");
    expect(nota?.referencia).toEqual({
      ncfModificado: venta.comprobante.ncf,
      fechaNcfModificado: venta.comprobante.fecha_emision,
      codigoModificacion: 3,
      razon: "Dañado",
    });
    expect(nota?.lineas).toEqual([
      { descripcion: "Arroz Selecto", cantidad: 1, precioUnitario: 118, tasaImpuesto: 0.18, subtotal: 118 },
    ]);
    expect(nota?.pagos).toEqual([]);
  });

  it("una devolución total anula el comprobante original (código 1)", async () => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    const venta = await ventaFiscal(d, 2);

    await registrarDevolucionConFiscal(
      d,
      { facturaId: venta.facturaId, lineas: [{ facturaLineaId: venta.lineaId, cantidad: 2 }] },
      EMISOR,
    );

    expect(recibidos.at(-1)?.referencia?.codigoModificacion).toBe(1);
  });

  it("si la DGII rechaza la nota, su número queda en cola para anular", async () => {
    const d = depsCon(db, crearProveedorQueRechazaDespues(1));
    const venta = await ventaFiscal(d, 1);

    await expect(
      registrarDevolucionConFiscal(
        d,
        { facturaId: venta.facturaId, lineas: [{ facturaLineaId: venta.lineaId, cantidad: 1 }] },
        EMISOR,
      ),
    ).rejects.toBeInstanceOf(ValidacionError);

    expect((await d.anulacionRepo.listarPendientes()).map((p) => p.ncf)).toEqual(["E340000000001"]);
  });
});

function crearProveedorQueRechazaDespues(aceptadas: number): ProveedorFiscal {
  let llamadas = 0;
  return {
    async transmitir() {
      llamadas += 1;
      return llamadas <= aceptadas ? ACEPTADO : { estado: "rechazado", motivoRechazo: "prueba" };
    },
  };
}

describe("emitirNotaDebitoFiscal — nota de débito E33 hacia la DGII", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function ventaFiscal(d: ReturnType<typeof depsCon>, conSecuencia33 = true) {
    await d.secuenciaRepo.crear({ tipoEcf: "32", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
    if (conSecuencia33) {
      await d.secuenciaRepo.crear({ tipoEcf: "33", rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(400) });
    }
    const t = await ticket(d.facturaRepo, 118, 1);
    const { comprobante } = await cobrarConFiscal(d, t.id, {
      pagos: [{ metodo: "efectivo", monto: 118 }],
      tipoEcf: "32",
      emisor: EMISOR,
    });
    return comprobante;
  }

  it("referencia el comprobante original y transmite el cargo adicional con su ITBIS", async () => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    const original = await ventaFiscal(d);

    const { comprobante } = await emitirNotaDebitoFiscal(
      d,
      {
        comprobanteId: original.id,
        concepto: "Interés por mora",
        monto: 59,
        tasaImpuesto: 0.18,
        codigoModificacion: 3,
        motivo: "Pago tardío",
      },
      EMISOR,
    );

    const nota = recibidos.at(-1);
    expect(nota?.tipoEcf).toBe("33");
    expect(nota?.ncf).toBe("E330000000001");
    expect(nota?.fechaVencimientoSecuencia).toBe(hoyMasDias(400));
    expect(nota?.referencia).toEqual({
      ncfModificado: original.ncf,
      fechaNcfModificado: original.fecha_emision,
      codigoModificacion: 3,
      razon: "Pago tardío",
    });
    expect(nota?.lineas).toEqual([
      { descripcion: "Interés por mora", cantidad: 1, precioUnitario: 59, tasaImpuesto: 0.18, subtotal: 59 },
    ]);
    expect(nota?.pagos).toEqual([]);
    expect([nota?.montoGravado, nota?.montoItbis, nota?.montoExento, nota?.total]).toEqual([50, 9, 0, 59]);

    expect(comprobante.tipo_ecf).toBe("33");
    expect(comprobante.ncf).toBe("E330000000001");
    expect(comprobante.factura_id).toBe(original.factura_id);
    expect(comprobante.estado_dgii).toBe("aceptado");
    expect(comprobante.total).toBe(59);
  });

  const BASE = {
    concepto: "Flete",
    monto: 100,
    tasaImpuesto: 0 as const,
    codigoModificacion: 3 as const,
    motivo: null,
  };

  it("un cargo exento no desglosa ITBIS", async () => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    const original = await ventaFiscal(d);

    await emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: original.id }, EMISOR);

    const nota = recibidos.at(-1);
    expect([nota?.montoGravado, nota?.montoItbis, nota?.montoExento, nota?.total]).toEqual([0, 0, 100, 100]);
  });

  it("si la DGII rechaza la nota, su número queda en cola para anular", async () => {
    const d = depsCon(db, crearProveedorQueRechazaDespues(1));
    const original = await ventaFiscal(d);

    await expect(emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: original.id }, EMISOR)).rejects.toBeInstanceOf(
      ValidacionError,
    );

    expect((await d.anulacionRepo.listarPendientes()).map((p) => p.ncf)).toEqual(["E330000000001"]);
  });

  it("sin secuencia E33 vigente no consume ni transmite nada", async () => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    const original = await ventaFiscal(d, false);
    const antes = recibidos.length;

    await expect(emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: original.id }, EMISOR)).rejects.toThrow(/E33/);
    expect(recibidos.length).toBe(antes);
  });

  it("exige los datos del emisor antes de consumir un número", async () => {
    const d = depsCon(db, proveedorQueResponde(ACEPTADO).proveedor);
    const original = await ventaFiscal(d);

    await expect(
      emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: original.id }, { ...EMISOR, rnc: "" }),
    ).rejects.toBeInstanceOf(ValidacionError);
    expect((await d.secuenciaRepo.obtenerVigente("33"))?.proximo_numero).toBe(1);
  });

  it.each([
    ["monto cero", { monto: 0 }],
    ["monto negativo", { monto: -5 }],
    ["tres decimales", { monto: 10.123 }],
    ["tasa no soportada", { tasaImpuesto: 0.1 as never }],
    ["concepto vacío", { concepto: "  " }],
  ])("rechaza %s sin consumir número", async (_nombre, cambio) => {
    const { proveedor, recibidos } = proveedorQueResponde(ACEPTADO);
    const d = depsCon(db, proveedor);
    const original = await ventaFiscal(d);
    const antes = recibidos.length;

    await expect(
      emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: original.id, ...cambio }, EMISOR),
    ).rejects.toBeInstanceOf(ValidacionError);
    expect(recibidos.length).toBe(antes);
  });

  it("no permite una nota de débito sobre un comprobante que no tiene validez fiscal", async () => {
    const d = depsCon(db, proveedorQueResponde({ estado: "en_proceso", trackId: "T1" }).proveedor);
    const original = await ventaFiscal(d);

    await expect(emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: original.id }, EMISOR)).rejects.toThrow(
      /validez fiscal/,
    );
  });

  it("no permite una nota de débito sobre otra nota", async () => {
    const d = depsCon(db, proveedorQueResponde(ACEPTADO).proveedor);
    const original = await ventaFiscal(d);
    const { comprobante: nota } = await emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: original.id }, EMISOR);

    await expect(emitirNotaDebitoFiscal(d, { ...BASE, comprobanteId: nota.id }, EMISOR)).rejects.toThrow(
      /E31 o un E32/,
    );
  });
});

describe("reconciliarComprobantesPendientes", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function comprobantePendiente(trackId: string | null, ncf: string) {
    const t = await crearFacturaRepo(db).abrirTicket();
    const secuencia = await crearSecuenciaNcfRepo(db).crear({
      tipoEcf: "31",
      rangoDesde: 1,
      rangoHasta: 100,
      vencimiento: hoyMasDias(365),
    });
    return crearComprobanteFiscalRepo(db).crear({
      facturaId: t.id,
      tipoEcf: "31",
      ncf,
      secuenciaId: secuencia.id,
      rncEmisor: EMISOR.rnc,
      receptorDocumentoTipo: "rnc",
      receptorDocumentoNumero: "101023122",
      montoGravado: 100,
      montoExento: 0,
      montoItbis: 18,
      total: 118,
      estadoDgii: "pendiente",
      trackIdDgii: trackId,
    });
  }

  it("actualiza cada pendiente con el estado que devuelve la DGII", async () => {
    const aceptar = await comprobantePendiente("t-ok", "E310000000001");
    const rechazar = await comprobantePendiente("t-mal", "E310000000002");
    const seguir = await comprobantePendiente("t-lento", "E310000000003");
    const repo = crearComprobanteFiscalRepo(db);

    const respuestas: Record<string, { estado: EstadoTransmision; motivoRechazo?: string }> = {
      "t-ok": { estado: "aceptado" },
      "t-mal": { estado: "rechazado", motivoRechazo: "RNC inválido" },
      "t-lento": { estado: "en_proceso" },
    };
    const resumen = await reconciliarComprobantesPendientes({
      comprobanteRepo: repo,
      consultarEstado: async (trackId) => respuestas[trackId]!,
    });

    expect((await repo.obtener(aceptar.id))?.estado_dgii).toBe("aceptado");
    const rechazado = await repo.obtener(rechazar.id);
    expect(rechazado?.estado_dgii).toBe("rechazado");
    expect(rechazado?.motivo_rechazo).toBe("RNC inválido");
    expect((await repo.obtener(seguir.id))?.estado_dgii).toBe("pendiente");
    expect(resumen).toEqual({ actualizados: 2, rechazados: ["E310000000002"], errores: 0 });
  });

  it("una consulta que falla deja el comprobante pendiente y no detiene al resto", async () => {
    const falla = await comprobantePendiente("t-falla", "E310000000001");
    const ok = await comprobantePendiente("t-ok", "E310000000002");
    const repo = crearComprobanteFiscalRepo(db);

    const resumen = await reconciliarComprobantesPendientes({
      comprobanteRepo: repo,
      consultarEstado: async (trackId) => {
        if (trackId === "t-falla") throw new Error("sin red");
        return { estado: "aceptado" };
      },
    });

    expect((await repo.obtener(falla.id))?.estado_dgii).toBe("pendiente");
    expect((await repo.obtener(ok.id))?.estado_dgii).toBe("aceptado");
    expect(resumen.errores).toBe(1);
  });

  it("ignora pendientes sin trackId", async () => {
    await comprobantePendiente(null, "E310000000001");
    let consultas = 0;
    await reconciliarComprobantesPendientes({
      comprobanteRepo: crearComprobanteFiscalRepo(db),
      consultarEstado: async () => {
        consultas += 1;
        return { estado: "aceptado" };
      },
    });
    expect(consultas).toBe(0);
  });
});

describe("anularNcfPendientes", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("agrupa números consecutivos en rangos por tipo y marca los anulados", async () => {
    const repo = crearNcfAnulacionRepo(db);
    for (const ncf of ["E320000000006", "E320000000005", "E320000000009", "E340000000002"]) {
      await repo.registrar({ tipoEcf: ncf.slice(1, 3) as "32" | "34", ncf, motivo: "sin conexión" });
    }

    const enviados: { tipoEcf: string; desde: string; hasta: string }[] = [];
    const resultado = await anularNcfPendientes({
      anulacionRepo: repo,
      rncEmisor: EMISOR.rnc,
      anular: async (_rnc, rangos) => {
        enviados.push(...rangos);
        return { aceptada: true, mensajes: ["Las secuencias fueron anuladas correctamente."] };
      },
    });

    expect(enviados).toEqual([
      { tipoEcf: "32", desde: "E320000000005", hasta: "E320000000006" },
      { tipoEcf: "32", desde: "E320000000009", hasta: "E320000000009" },
      { tipoEcf: "34", desde: "E340000000002", hasta: "E340000000002" },
    ]);
    expect(resultado.anulados).toBe(4);
    expect(await repo.listarPendientes()).toEqual([]);
  });

  it("anula cada rango por separado: un rango rechazado no bloquea a los demás", async () => {
    const repo = crearNcfAnulacionRepo(db);
    await repo.registrar({ tipoEcf: "32", ncf: "E320000000001", motivo: "sin conexión" });
    await repo.registrar({ tipoEcf: "32", ncf: "E320000000009", motivo: "sin conexión" });

    const resultado = await anularNcfPendientes({
      anulacionRepo: repo,
      rncEmisor: EMISOR.rnc,
      anular: async (_rnc, [rango]) =>
        rango?.desde === "E320000000001"
          ? { aceptada: false, mensajes: ["No fue posible anular las siguientes secuencias"] }
          : { aceptada: true, mensajes: ["ok"] },
    });

    expect(resultado.anulados).toBe(1);
    const pendientes = await repo.listarPendientes();
    expect(pendientes.map((p) => p.ncf)).toEqual(["E320000000001"]);
    expect(pendientes[0]?.ultimo_mensaje_dgii).toContain("No fue posible anular");
  });

  it("si la DGII dice que el número sí se utilizó, sale de la cola y queda marcado para revisión", async () => {
    const repo = crearNcfAnulacionRepo(db);
    await repo.registrar({ tipoEcf: "32", ncf: "E320000000001", motivo: "tiempo de espera agotado" });

    const resultado = await anularNcfPendientes({
      anulacionRepo: repo,
      rncEmisor: EMISOR.rnc,
      anular: async () => ({
        aceptada: false,
        mensajes: ["Las secuencias que está intentando anular han sido utilizadas"],
      }),
    });

    expect(resultado).toEqual({ anulados: 0, utilizados: ["E320000000001"] });
    expect(await repo.listarPendientes()).toEqual([]);
    const [utilizado] = await repo.listarUtilizados();
    expect(utilizado?.ncf).toBe("E320000000001");
  });

  it("no llama a la DGII si no hay nada que anular", async () => {
    let llamado = false;
    const resultado = await anularNcfPendientes({
      anulacionRepo: crearNcfAnulacionRepo(db),
      rncEmisor: EMISOR.rnc,
      anular: async () => {
        llamado = true;
        return { aceptada: true, mensajes: [] };
      },
    });
    expect(llamado).toBe(false);
    expect(resultado).toEqual({ anulados: 0, utilizados: [] });
  });
});

describe("anularNcfPendientes — verificación previa en la DGII", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("no anula un número que la DGII sí recibió: lo marca utilizado con su trackId", async () => {
    const repo = crearNcfAnulacionRepo(db);
    await repo.registrar({ tipoEcf: "31", ncf: "E310000000004", motivo: "tiempo de espera agotado" });
    await repo.registrar({ tipoEcf: "31", ncf: "E310000000005", motivo: "sin conexión" });

    const anulados: string[] = [];
    const resultado = await anularNcfPendientes({
      anulacionRepo: repo,
      rncEmisor: EMISOR.rnc,
      consultarTrackIds: async (encf) => (encf === "E310000000004" ? [{ trackId: "t-77", estado: "aceptado" }] : []),
      anular: async (_rnc, rangos) => {
        anulados.push(...rangos.map((r) => `${r.desde}-${r.hasta}`));
        return { aceptada: true, mensajes: [] };
      },
    });

    expect(anulados).toEqual(["E310000000005-E310000000005"]);
    expect(resultado).toEqual({ anulados: 1, utilizados: ["E310000000004"] });
    const [utilizado] = await repo.listarUtilizados();
    expect(utilizado?.ultimo_mensaje_dgii).toContain("t-77");
  });

  it("si la consulta de trackIds falla, no anula ese número y lo reintenta después", async () => {
    const repo = crearNcfAnulacionRepo(db);
    await repo.registrar({ tipoEcf: "31", ncf: "E310000000004", motivo: "sin conexión" });

    let llamadas = 0;
    const resultado = await anularNcfPendientes({
      anulacionRepo: repo,
      rncEmisor: EMISOR.rnc,
      consultarTrackIds: async () => {
        throw new Error("DGII caída");
      },
      anular: async () => {
        llamadas += 1;
        return { aceptada: true, mensajes: [] };
      },
    });

    expect(llamadas).toBe(0);
    expect(resultado.anulados).toBe(0);
    expect((await repo.listarPendientes()).map((p) => p.ncf)).toEqual(["E310000000004"]);
  });
});
