import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearCompraRepo,
  crearComprobanteFiscalRepo,
  crearNcfAnulacionRepo,
  crearProveedorRepo,
  crearSecuenciaNcfRepo,
  emitirComprobanteDeCompra,
  ValidacionError,
  type ComprobanteATransmitir,
  type EmisorFiscal,
  type ProveedorFiscal,
  type ResultadoTransmision,
  type TipoEcf,
} from "../src/index.js";

const EMISOR: EmisorFiscal = {
  rnc: "131880738",
  razonSocial: "SUPLIDORA MAROHI SRL",
  nombreComercial: null,
  direccion: "Calle Principal #1, Santo Domingo",
};

const ACEPTADO: ResultadoTransmision = { estado: "aceptado", codigoSeguridad: "AbC123", xmlFirmado: "<ECF>x</ECF>" };

function hoyMasDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function proveedorFiscalQue(resultado: ResultadoTransmision | "rechaza") {
  const recibidos: ComprobanteATransmitir[] = [];
  const proveedor: ProveedorFiscal = {
    async transmitir(c) {
      recibidos.push(c);
      return resultado === "rechaza" ? { estado: "rechazado", motivoRechazo: "prueba" } : resultado;
    },
  };
  return { proveedor, recibidos };
}

describe("emitirComprobanteDeCompra — E41, E43 y E47 hacia la DGII", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = createNodeSqliteDriver();
    await migrate(db);
  });

  function depsCon(proveedorFiscal: ProveedorFiscal) {
    return {
      compraRepo: crearCompraRepo(db),
      proveedorRepo: crearProveedorRepo(db),
      secuenciaRepo: crearSecuenciaNcfRepo(db),
      comprobanteRepo: crearComprobanteFiscalRepo(db),
      anulacionRepo: crearNcfAnulacionRepo(db),
      proveedorFiscal,
    };
  }

  async function secuencia(d: ReturnType<typeof depsCon>, tipoEcf: TipoEcf) {
    await d.secuenciaRepo.crear({ tipoEcf, rangoDesde: 1, rangoHasta: 100, vencimiento: hoyMasDias(365) });
  }

  async function compraE41(d: ReturnType<typeof depsCon>, conProveedor = true) {
    const proveedor = conProveedor
      ? await d.proveedorRepo.crear({
          nombre: "PLOMERO EJEMPLO SRL",
          rnc: "101010101",
          telefono: null,
          correo: null,
          direccion: null,
        })
      : null;
    const compra = await d.compraRepo.crear({
      proveedor_id: proveedor?.id ?? null,
      lineas: [
        {
          descripcion: "Reparación de tubería",
          cantidad: 1,
          costoUnitario: 1180,
          impuestoTipo: "itbis18",
          tasaImpuesto: 0.18,
        },
        { descripcion: "Llave de paso", cantidad: 2, costoUnitario: 25, impuestoTipo: "exento", tasaImpuesto: 0 },
      ],
    });
    const lineas = await d.compraRepo.obtenerLineas(compra.id);
    const servicio = lineas.find((l) => l.descripcion === "Reparación de tubería")!;
    return { compra, servicio, bien: lineas.find((l) => l.descripcion === "Llave de paso")! };
  }

  describe("Compras (E41)", () => {
    it("transmite al proveedor como comprador, con las retenciones por línea, y marca la compra", async () => {
      const { proveedor, recibidos } = proveedorFiscalQue(ACEPTADO);
      const d = depsCon(proveedor);
      await secuencia(d, "41");
      const { compra, servicio } = await compraE41(d);

      const { comprobante } = await emitirComprobanteDeCompra(
        d,
        {
          compraId: compra.id,
          tipoEcf: "41",
          retenciones: { [servicio.id]: { esServicio: true, itbisRetenido: 54, isrRetenido: 50 } },
        },
        EMISOR,
      );

      const enviado = recibidos.at(-1);
      expect(enviado?.tipoEcf).toBe("41");
      expect(enviado?.ncf).toBe("E410000000001");
      expect(enviado?.receptorDocumentoNumero).toBe("101010101");
      expect(enviado?.receptorNombre).toBe("PLOMERO EJEMPLO SRL");
      expect(enviado?.fechaVencimientoSecuencia).toBe(hoyMasDias(365));
      expect(enviado?.lineas).toEqual([
        {
          descripcion: "Reparación de tubería",
          cantidad: 1,
          precioUnitario: 1180,
          tasaImpuesto: 0.18,
          subtotal: 1180,
          esServicio: true,
          itbisRetenido: 54,
          isrRetenido: 50,
        },
        { descripcion: "Llave de paso", cantidad: 2, precioUnitario: 25, tasaImpuesto: 0, subtotal: 50 },
      ]);
      expect([enviado?.montoGravado, enviado?.montoExento, enviado?.montoItbis, enviado?.total]).toEqual([
        1000, 50, 180, 1230,
      ]);
      expect(enviado?.pagos).toEqual([{ metodo: "efectivo", monto: 1230 }]);

      expect(comprobante).toMatchObject({
        tipo_ecf: "41",
        compra_id: compra.id,
        factura_id: null,
        estado_dgii: "aceptado",
      });
      const compraMarcada = await d.compraRepo.obtener(compra.id);
      expect(compraMarcada).toMatchObject({ ncf_proveedor: null, tiene_comprobante_fiscal: 1 });
      expect((await d.comprobanteRepo.obtenerPorCompra(compra.id))?.ncf).toBe("E410000000001");
    });

    it("exige un proveedor con RNC y razón social, sin consumir número", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "41");
      const { compra } = await compraE41(d, false);

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR),
      ).rejects.toBeInstanceOf(ValidacionError);
      expect((await d.secuenciaRepo.obtenerVigente("41"))?.proximo_numero).toBe(1);
    });

    it.each([
      ["ITBIS retenido mayor que el ITBIS de la línea", { esServicio: true, itbisRetenido: 181 }],
      ["ITBIS retenido en una línea exenta", { itbisRetenido: 1 }],
      ["ISR retenido mayor que el monto", { esServicio: true, isrRetenido: 1181 }],
      ["ISR retenido en un bien", { isrRetenido: 10 }],
      ["retención negativa", { esServicio: true, isrRetenido: -1 }],
    ])("rechaza %s sin consumir número", async (_nombre, retencion) => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "41");
      const { compra, servicio, bien } = await compraE41(d);
      const esLineaExenta = _nombre.includes("exenta");
      const lineaId = esLineaExenta ? bien.id : servicio.id;
      const bienSinServicio = _nombre.includes("bien");

      await expect(
        emitirComprobanteDeCompra(
          d,
          { compraId: compra.id, tipoEcf: "41", retenciones: { [bienSinServicio ? bien.id : lineaId]: retencion } },
          EMISOR,
        ),
      ).rejects.toBeInstanceOf(ValidacionError);
      expect((await d.secuenciaRepo.obtenerVigente("41"))?.proximo_numero).toBe(1);
    });

    it("si la DGII rechaza, el número queda en cola para anular y la compra no se marca", async () => {
      const d = depsCon(proveedorFiscalQue("rechaza").proveedor);
      await secuencia(d, "41");
      const { compra } = await compraE41(d);

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR),
      ).rejects.toBeInstanceOf(ValidacionError);

      expect((await d.anulacionRepo.listarPendientes()).map((p) => p.ncf)).toEqual(["E410000000001"]);
      expect((await d.compraRepo.obtener(compra.id))?.tiene_comprobante_fiscal).toBe(0);
    });

    it("normaliza el RNC del proveedor antes de enviarlo", async () => {
      const { proveedor, recibidos } = proveedorFiscalQue(ACEPTADO);
      const d = depsCon(proveedor);
      await secuencia(d, "41");
      const prov = await d.proveedorRepo.crear({
        nombre: "PLOMERO EJEMPLO SRL",
        rnc: "101-01010-1",
        telefono: null,
        correo: null,
        direccion: null,
      });
      const compra = await d.compraRepo.crear({
        proveedor_id: prov.id,
        lineas: [
          { descripcion: "Reparación", cantidad: 1, costoUnitario: 100, impuestoTipo: "exento", tasaImpuesto: 0 },
        ],
      });

      await emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR);

      expect(recibidos.at(-1)?.receptorDocumentoNumero).toBe("101010101");
      expect(recibidos.at(-1)?.receptorDocumentoTipo).toBe("rnc");
    });

    it("rechaza un RNC que no tiene 9 u 11 dígitos, sin consumir número", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "41");
      const prov = await d.proveedorRepo.crear({
        nombre: "PLOMERO EJEMPLO SRL",
        rnc: "12345",
        telefono: null,
        correo: null,
        direccion: null,
      });
      const compra = await d.compraRepo.crear({
        proveedor_id: prov.id,
        lineas: [
          { descripcion: "Reparación", cantidad: 1, costoUnitario: 100, impuestoTipo: "exento", tasaImpuesto: 0 },
        ],
      });

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR),
      ).rejects.toBeInstanceOf(ValidacionError);
      expect((await d.secuenciaRepo.obtenerVigente("41"))?.proximo_numero).toBe(1);
    });

    it("no se emite sobre una compra que ya trae el NCF del proveedor", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "41");
      const compra = await d.compraRepo.crear({
        ncf_proveedor: "B0100000001",
        lineas: [
          { descripcion: "Reparación", cantidad: 1, costoUnitario: 100, impuestoTipo: "exento", tasaImpuesto: 0 },
        ],
      });

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR),
      ).rejects.toThrow(/NCF del proveedor/);
      expect((await d.secuenciaRepo.obtenerVigente("41"))?.proximo_numero).toBe(1);
      expect((await d.compraRepo.obtener(compra.id))?.ncf_proveedor).toBe("B0100000001");
    });

    it("no emite si ya existe un comprobante de la compra aunque la compra no quedara marcada", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "41");
      const { compra } = await compraE41(d);
      const vigente = await d.secuenciaRepo.obtenerVigente("41");
      await d.comprobanteRepo.crear({
        compraId: compra.id,
        tipoEcf: "41",
        ncf: "E410000000099",
        secuenciaId: vigente!.id,
        rncEmisor: EMISOR.rnc,
        receptorDocumentoTipo: null,
        receptorDocumentoNumero: null,
        montoGravado: 0,
        montoExento: 0,
        montoItbis: 0,
        total: 0,
        estadoDgii: "aceptado",
      });

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR),
      ).rejects.toThrow(/ya tiene/i);
      expect((await d.secuenciaRepo.obtenerVigente("41"))?.proximo_numero).toBe(1);
    });

    it("no emite dos comprobantes para la misma compra", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "41");
      const { compra } = await compraE41(d);
      await emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR);

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR),
      ).rejects.toThrow(/ya tiene/i);
    });

    it("sin secuencia E41 vigente no consume ni transmite nada", async () => {
      const { proveedor, recibidos } = proveedorFiscalQue(ACEPTADO);
      const d = depsCon(proveedor);
      const { compra } = await compraE41(d);

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "41", retenciones: {} }, EMISOR),
      ).rejects.toThrow(/E41/);
      expect(recibidos).toEqual([]);
    });
  });

  describe("Gastos menores (E43)", () => {
    async function gastoMenor(d: ReturnType<typeof depsCon>, tasa: 0 | 0.18 = 0) {
      return d.compraRepo.crear({
        lineas: [
          {
            descripcion: "Taxi a la aduana",
            cantidad: 1,
            costoUnitario: 350,
            impuestoTipo: tasa === 0 ? "exento" : "itbis18",
            tasaImpuesto: tasa,
          },
        ],
      });
    }

    it("transmite el gasto sin comprador, exento y sin retenciones", async () => {
      const { proveedor, recibidos } = proveedorFiscalQue(ACEPTADO);
      const d = depsCon(proveedor);
      await secuencia(d, "43");
      const compra = await gastoMenor(d);

      const { comprobante } = await emitirComprobanteDeCompra(
        d,
        { compraId: compra.id, tipoEcf: "43", retenciones: {} },
        EMISOR,
      );

      const enviado = recibidos.at(-1);
      expect(enviado?.tipoEcf).toBe("43");
      expect(enviado?.receptorDocumentoNumero).toBeNull();
      expect(enviado?.receptorNombre).toBeNull();
      expect([enviado?.montoGravado, enviado?.montoExento, enviado?.total]).toEqual([0, 350, 350]);
      expect(enviado?.pagos).toEqual([]);
      expect(comprobante.tipo_ecf).toBe("43");
      expect((await d.comprobanteRepo.obtenerPorCompra(compra.id))?.ncf).toBe("E430000000001");
      expect((await d.compraRepo.obtener(compra.id))?.tiene_comprobante_fiscal).toBe(1);
    });

    it("rechaza un gasto con ITBIS sin consumir número", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "43");
      const compra = await gastoMenor(d, 0.18);

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "43", retenciones: {} }, EMISOR),
      ).rejects.toBeInstanceOf(ValidacionError);
      expect((await d.secuenciaRepo.obtenerVigente("43"))?.proximo_numero).toBe(1);
    });
  });

  describe("Pagos al exterior (E47)", () => {
    async function pagoExterior(d: ReturnType<typeof depsCon>) {
      const proveedor = await d.proveedorRepo.crear({
        nombre: "ACME LLC",
        rnc: "PA1234567",
        telefono: null,
        correo: null,
        direccion: null,
      });
      const compra = await d.compraRepo.crear({
        proveedor_id: proveedor.id,
        lineas: [
          {
            descripcion: "Licencia de software",
            cantidad: 1,
            costoUnitario: 10000,
            impuestoTipo: "exento",
            tasaImpuesto: 0,
          },
        ],
      });
      const [linea] = await d.compraRepo.obtenerLineas(compra.id);
      return { compra, linea: linea! };
    }

    it("transmite con el proveedor extranjero y el ISR retenido de cada línea", async () => {
      const { proveedor, recibidos } = proveedorFiscalQue(ACEPTADO);
      const d = depsCon(proveedor);
      await secuencia(d, "47");
      const { compra, linea } = await pagoExterior(d);

      await emitirComprobanteDeCompra(
        d,
        { compraId: compra.id, tipoEcf: "47", retenciones: { [linea.id]: { esServicio: true, isrRetenido: 2700 } } },
        EMISOR,
      );

      const enviado = recibidos.at(-1);
      expect(enviado?.tipoEcf).toBe("47");
      expect(enviado?.receptorDocumentoNumero).toBe("PA1234567");
      expect(enviado?.receptorDocumentoTipo).toBeNull();
      expect(enviado?.receptorNombre).toBe("ACME LLC");
      expect(enviado?.lineas[0]).toMatchObject({ esServicio: true, isrRetenido: 2700 });
      expect(enviado?.lineas[0]).not.toHaveProperty("itbisRetenido");
    });

    it("exige un proveedor identificado, sin consumir número", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "47");
      const compra = await d.compraRepo.crear({
        lineas: [{ descripcion: "Licencia", cantidad: 1, costoUnitario: 100, impuestoTipo: "exento", tasaImpuesto: 0 }],
      });
      const [linea] = await d.compraRepo.obtenerLineas(compra.id);

      await expect(
        emitirComprobanteDeCompra(
          d,
          { compraId: compra.id, tipoEcf: "47", retenciones: { [linea!.id]: { esServicio: true, isrRetenido: 10 } } },
          EMISOR,
        ),
      ).rejects.toBeInstanceOf(ValidacionError);
      expect((await d.secuenciaRepo.obtenerVigente("47"))?.proximo_numero).toBe(1);
    });

    it("marca cada artículo como servicio, lo único que admite la DGII en un E47", async () => {
      const { proveedor, recibidos } = proveedorFiscalQue(ACEPTADO);
      const d = depsCon(proveedor);
      await secuencia(d, "47");
      const { compra, linea } = await pagoExterior(d);

      await emitirComprobanteDeCompra(
        d,
        { compraId: compra.id, tipoEcf: "47", retenciones: { [linea.id]: { isrRetenido: 2700 } } },
        EMISOR,
      );

      expect(recibidos.at(-1)?.lineas.every((l) => l.esServicio === true)).toBe(true);
    });

    it("exige el ISR retenido de cada línea, sin consumir número", async () => {
      const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
      await secuencia(d, "47");
      const { compra } = await pagoExterior(d);

      await expect(
        emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "47", retenciones: {} }, EMISOR),
      ).rejects.toBeInstanceOf(ValidacionError);
      expect((await d.secuenciaRepo.obtenerVigente("47"))?.proximo_numero).toBe(1);
    });
  });

  it("exige los datos completos del emisor antes de consumir un número", async () => {
    const d = depsCon(proveedorFiscalQue(ACEPTADO).proveedor);
    await secuencia(d, "43");
    const compra = await d.compraRepo.crear({
      lineas: [{ descripcion: "Taxi", cantidad: 1, costoUnitario: 100, impuestoTipo: "exento", tasaImpuesto: 0 }],
    });

    await expect(
      emitirComprobanteDeCompra(d, { compraId: compra.id, tipoEcf: "43", retenciones: {} }, { ...EMISOR, rnc: "" }),
    ).rejects.toBeInstanceOf(ValidacionError);
    expect((await d.secuenciaRepo.obtenerVigente("43"))?.proximo_numero).toBe(1);
  });
});
