import { describe, expect, it } from "vitest";
import {
  ordenEnvioSetPruebas,
  procesarFilaSetPruebas,
  type DgiiSetPruebas,
} from "../../src/fiscal/certificacion/set-pruebas.js";
import { cargarEsquema, type NombreEsquema } from "../../src/fiscal/certificacion/esquema.js";
import { aplanarXml } from "../../src/fiscal/certificacion/generador.js";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { construirXmlAcecf } from "../../src/fiscal/xml/acecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { codigoSeguridad } from "../../src/fiscal/codigo-seguridad.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import {
  compraInformalPrueba,
  consumoPrueba,
  creditoFiscalPrueba,
  gastoMenorPrueba,
  gubernamentalPrueba,
  notaDebitoPrueba,
  pagoExteriorPrueba,
} from "./datos-prueba.js";

const AHORA = new Date("2026-10-01T18:31:05.000Z");
const firmar = (xml: string) => firmarXml(xml, cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA));

function filaDe(xml: string, esquema: NombreEsquema): Record<string, string> {
  const fila = aplanarXml(cargarEsquema(esquema), xml);
  delete fila.FechaHoraFirma;
  return fila;
}

function dgiiFalsa() {
  const llamadas: { ruta: string; nombre: string; xml: string }[] = [];
  const dgii: DgiiSetPruebas = {
    enviarEcf: async (xml, nombre) => {
      llamadas.push({ ruta: "ecf", nombre, xml });
      return { trackId: "track-1" };
    },
    consultarResultado: async () => ({ estado: "aceptado", mensajes: [], secuenciaUtilizada: true }),
    enviarRfce: async (xml, nombre) => {
      llamadas.push({ ruta: "rfce", nombre, xml });
      return { estado: "aceptado", mensajes: [], secuenciaUtilizada: true };
    },
    enviarAprobacionComercial: async (xml, nombre) => {
      llamadas.push({ ruta: "acecf", nombre, xml });
      return { aceptada: true, mensajes: ["OK"] };
    },
  };
  return { dgii, llamadas };
}

describe("set de pruebas DGII — procesamiento de una fila", () => {
  it("en simulacro genera y firma el XML, lo valida contra el XSD y no envía nada", async () => {
    const { dgii, llamadas } = dgiiFalsa();
    const r = await procesarFilaSetPruebas(filaDe(construirXmlEcf(creditoFiscalPrueba(), AHORA), "ecf-31"), 2, {
      firmar,
      dgii,
      enviar: false,
      reloj: () => AHORA,
    });

    expect(r).toMatchObject({
      fila: 2,
      esquema: "ecf-31",
      encf: "E310000000001",
      nombreArchivo: "131880738E310000000001.xml",
      erroresXsd: [],
      columnasSinUsar: [],
    });
    expect(r.xmlFirmado).toContain("<FechaHoraFirma>01-10-2026 14:31:05</FechaHoraFirma>");
    expect(r.xmlFirmado).toContain("<SignatureValue>");
    expect(r.envio).toBeUndefined();
    expect(llamadas).toEqual([]);
  });

  it("envía un E31 a recepción y consulta el resultado", async () => {
    const { dgii, llamadas } = dgiiFalsa();
    const r = await procesarFilaSetPruebas(filaDe(construirXmlEcf(creditoFiscalPrueba(), AHORA), "ecf-31"), 2, {
      firmar,
      dgii,
      enviar: true,
      reloj: () => AHORA,
    });
    expect(llamadas.map((l) => l.ruta)).toEqual(["ecf"]);
    expect(r.envio).toEqual({ ruta: "ecf", estado: "aceptado", trackId: "track-1", mensajes: [] });
  });

  it("un consumo menor a RD$250,000 se envía como resumen RFCE con el código de seguridad del e-CF", async () => {
    const { dgii, llamadas } = dgiiFalsa();
    const r = await procesarFilaSetPruebas(filaDe(construirXmlEcf(consumoPrueba(), AHORA), "ecf-32"), 3, {
      firmar,
      dgii,
      enviar: true,
      reloj: () => AHORA,
    });
    const [rfce] = llamadas;
    expect(rfce?.ruta).toBe("rfce");
    expect(rfce?.xml).toContain(`<CodigoSeguridadeCF>${codigoSeguridad(r.xmlFirmado)}</CodigoSeguridadeCF>`);
    expect(r.erroresXsd).toEqual([]);
  });

  it("lee el e-NCF y los RNC aunque la columna venga en mayúsculas (ENCF)", async () => {
    const { dgii } = dgiiFalsa();
    const fila = filaDe(construirXmlEcf(creditoFiscalPrueba(), AHORA), "ecf-31");
    const { eNCF, ...resto } = fila;
    const r = await procesarFilaSetPruebas({ ...resto, ENCF: eNCF ?? "" }, 2, {
      firmar,
      dgii,
      enviar: false,
      reloj: () => AHORA,
    });

    expect(r.encf).toBe("E310000000001");
    expect(r.nombreArchivo).toBe("131880738E310000000001.xml");
    expect(r.erroresXsd).toEqual([]);
  });

  it("una fila de la hoja RFCE se valida como resumen y nunca se envía (ya se envía el derivado del e-CF)", async () => {
    const { dgii, llamadas } = dgiiFalsa();
    const rfce: Record<string, string> = {
      CasoPrueba: "131880738E320000000014",
      Version: "1.0",
      TipoeCF: "32",
      ENCF: "E320000000014",
      TipoIngresos: "01",
      TipoPago: "1",
      "FormaPago[1]": "1",
      "MontoPago[1]": "11918.00",
      RNCEmisor: "131880738",
      RazonSocialEmisor: "SUPLIDORA MAROHI SRL",
      FechaEmision: "01-04-2020",
      RNCComprador: "131880681",
      MontoGravadoTotal: "10100.00",
      MontoGravadoI1: "10100.00",
      TotalITBIS: "1818.00",
      TotalITBIS1: "1818.00",
      MontoTotal: "11918.00",
      CodigoSeguridadeCF: "#e",
    };
    const r = await procesarFilaSetPruebas(rfce, 2, { firmar, dgii, enviar: true, reloj: () => AHORA });

    expect(r.esquema).toBe("rfce-32");
    expect(r.nombreArchivo).toBe("131880738E320000000014-resumen.xml");
    expect(r.envio).toBeUndefined();
    expect(llamadas).toEqual([]);
  });

  it("una fila que no cumple el XSD no se envía y reporta los errores", async () => {
    const { dgii, llamadas } = dgiiFalsa();
    const fila = filaDe(construirXmlEcf(creditoFiscalPrueba(), AHORA), "ecf-31");
    delete fila.RNCComprador;
    const r = await procesarFilaSetPruebas(fila, 4, { firmar, dgii, enviar: true, reloj: () => AHORA });
    expect(r.erroresXsd.length).toBeGreaterThan(0);
    expect(llamadas).toEqual([]);
  });

  it("una fila de aprobación comercial genera el ACECF y lo envía a la DGII", async () => {
    const { dgii, llamadas } = dgiiFalsa();
    const acecf = construirXmlAcecf(
      {
        rncEmisor: "101010101",
        encf: "E310000000007",
        fechaEmision: "25-09-2026",
        montoTotal: 1180,
        rncComprador: "131880738",
        aprobado: true,
      },
      AHORA,
    );
    const fila = aplanarXml(cargarEsquema("acecf"), acecf);
    delete fila.FechaHoraAprobacionComercial;

    const r = await procesarFilaSetPruebas(fila, 5, { firmar, dgii, enviar: true, reloj: () => AHORA });

    expect(r).toMatchObject({ esquema: "acecf", nombreArchivo: "131880738E310000000007.xml", erroresXsd: [] });
    expect(llamadas.map((l) => l.ruta)).toEqual(["acecf"]);
    expect(r.envio).toEqual({ ruta: "acecf", estado: "aceptado", mensajes: ["OK"] });
  });

  it("una fila sin tipo reconocible es un error de la fila, no del lote", async () => {
    const { dgii } = dgiiFalsa();
    const r = await procesarFilaSetPruebas({ Columna: "x" }, 6, { firmar, dgii, enviar: false, reloj: () => AHORA });
    expect(r.error).toMatch(/tipo/i);
  });
});

const FILA_E44: Record<string, string> = {
  Version: "1.0",
  TipoeCF: "44",
  eNCF: "E440000000001",
  FechaVencimientoSecuencia: "31-12-2027",
  TipoIngresos: "01",
  TipoPago: "1",
  RNCEmisor: "131880738",
  RazonSocialEmisor: "SUPLIDORA MAROHI SRL",
  DireccionEmisor: "Calle Principal #1",
  FechaEmision: "01-10-2026",
  RazonSocialComprador: "ZONA FRANCA EJEMPLO SA",
  MontoExento: "100.00",
  MontoTotal: "100.00",
  "NumeroLinea[1]": "1",
  "IndicadorFacturacion[1]": "4",
  "NombreItem[1]": "Mercancía",
  "IndicadorBienoServicio[1]": "1",
  "CantidadItem[1]": "1.00",
  "PrecioUnitarioItem[1]": "100.00",
  "MontoItem[1]": "100.00",
};

const FILA_E46: Record<string, string> = {
  ...FILA_E44,
  TipoeCF: "46",
  eNCF: "E460000000001",
  RazonSocialComprador: "ACME LLC",
  MontoExento: "",
  MontoGravadoTotal: "100.00",
  MontoGravadoI3: "100.00",
  ITBIS3: "0",
  TotalITBIS: "0.00",
  TotalITBIS3: "0.00",
  "IndicadorFacturacion[1]": "3",
};

describe("set de pruebas DGII — los tipos de e-CF adicionales", () => {
  const generados: [string, NombreEsquema, () => string][] = [
    ["E33", "ecf-33", () => construirXmlEcf(notaDebitoPrueba(), AHORA)],
    ["E41", "ecf-41", () => construirXmlEcf(compraInformalPrueba(), AHORA)],
    ["E43", "ecf-43", () => construirXmlEcf(gastoMenorPrueba(), AHORA)],
    ["E45", "ecf-45", () => construirXmlEcf(gubernamentalPrueba(), AHORA)],
    ["E47", "ecf-47", () => construirXmlEcf(pagoExteriorPrueba(), AHORA)],
  ];

  it.each(generados)(
    "una fila de %s reproduce nuestro XML, cumple el XSD y se envía por recepción",
    async (_tipo, esquema, xml) => {
      const { dgii, llamadas } = dgiiFalsa();
      const original = xml();

      const r = await procesarFilaSetPruebas(filaDe(original, esquema), 2, {
        firmar,
        dgii,
        enviar: true,
        reloj: () => AHORA,
      });

      expect(r).toMatchObject({ esquema, erroresXsd: [], columnasSinUsar: [] });
      expect(r.envio).toMatchObject({ ruta: "ecf", estado: "aceptado" });
      expect(llamadas.map((l) => l.ruta)).toEqual(["ecf"]);
      expect(r.xmlFirmado).toContain(
        original.slice(original.indexOf("<Encabezado>"), original.indexOf("<FechaHoraFirma>")),
      );
    },
  );

  it.each([
    ["E44", "ecf-44", FILA_E44],
    ["E46", "ecf-46", FILA_E46],
  ] as const)("una fila de %s se genera, firma y valida contra el XSD", async (_tipo, esquema, fila) => {
    const { dgii, llamadas } = dgiiFalsa();

    const r = await procesarFilaSetPruebas(fila, 2, { firmar, dgii, enviar: false, reloj: () => AHORA });

    expect(r).toMatchObject({ esquema, erroresXsd: [], columnasSinUsar: [] });
    expect(r.xmlFirmado).toContain("<SignatureValue>");
    expect(llamadas).toEqual([]);
  });
});

describe("orden de envío del set de pruebas (portal DGII)", () => {
  const fila = (tipo: string, total = "1000.00", extra: Record<string, string> = {}) => ({
    TipoeCF: tipo,
    MontoTotal: total,
    ...extra,
  });

  it("manda primero 31, 32 ≥ 250 mil, 41, 43, 44, 45, 46 y 47; luego 33 y 34; al final los consumos menores", () => {
    const filas = [
      fila("34"),
      fila("32", "11918.00"),
      fila("47"),
      fila("33"),
      fila("45"),
      fila("32", "413785.30"),
      fila("31"),
      fila("41"),
      fila("46"),
      fila("44"),
      fila("43"),
    ];

    const orden = ordenEnvioSetPruebas(filas, (f) => f).map((f) => `${f.TipoeCF}:${f.MontoTotal}`);

    expect(orden).toEqual([
      "31:1000.00",
      "32:413785.30",
      "41:1000.00",
      "43:1000.00",
      "44:1000.00",
      "45:1000.00",
      "46:1000.00",
      "47:1000.00",
      "33:1000.00",
      "34:1000.00",
      "32:11918.00",
    ]);
  });

  it("conserva el orden original entre filas del mismo grupo", () => {
    const a = fila("31", "1.00", { ENCF: "E310000000001" });
    const b = fila("31", "2.00", { ENCF: "E310000000002" });
    expect(ordenEnvioSetPruebas([b, a], (f) => f)).toEqual([b, a]);
  });

  it("no altera el arreglo original", () => {
    const filas = [fila("34"), fila("31")];
    ordenEnvioSetPruebas(filas, (f) => f);
    expect(filas.map((f) => f.TipoeCF)).toEqual(["34", "31"]);
  });
});
