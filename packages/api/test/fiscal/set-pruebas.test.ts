import { describe, expect, it } from "vitest";
import { procesarFilaSetPruebas, type DgiiSetPruebas } from "../../src/fiscal/certificacion/set-pruebas.js";
import { cargarEsquema } from "../../src/fiscal/certificacion/esquema.js";
import { aplanarXml } from "../../src/fiscal/certificacion/generador.js";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { construirXmlAcecf } from "../../src/fiscal/xml/acecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { codigoSeguridad } from "../../src/fiscal/codigo-seguridad.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { consumoPrueba, creditoFiscalPrueba } from "./datos-prueba.js";

const AHORA = new Date("2026-10-01T18:31:05.000Z");
const firmar = (xml: string) => firmarXml(xml, cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA));

function filaDe(xml: string, esquema: "ecf-31" | "ecf-32" | "acecf"): Record<string, string> {
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
