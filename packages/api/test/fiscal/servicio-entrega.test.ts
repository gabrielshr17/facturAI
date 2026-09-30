import { describe, expect, it } from "vitest";
import { crearServicioEntrega } from "../../src/fiscal/servicio-entrega.js";
import type { ClienteContribuyente } from "../../src/fiscal/entrega.js";
import type { DirectorioContribuyente } from "../../src/fiscal/dgii-cliente.js";
import { DocumentoFiscalInvalidoError } from "../../src/fiscal/errores.js";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { creditoFiscalPrueba, EMISOR_PRUEBA } from "./datos-prueba.js";

const AHORA = new Date("2026-10-01T18:31:05.000Z");
const DIRECTORIO: DirectorioContribuyente = {
  urlRecepcion: "https://comprador.do/fe",
  urlAceptacion: "https://comprador.do/fe",
  urlAutenticacion: null,
};

function servicio(directorio: DirectorioContribuyente | null, acuseRecibido = true) {
  const entregas: string[] = [];
  const contribuyente: ClienteContribuyente = {
    entregarEcf: async (_d, _xml, nombre) => {
      entregas.push(nombre);
      return acuseRecibido
        ? { recibido: true, xml: "<ARECF/>" }
        : { recibido: false, motivo: 2, xml: "<ARECF>no</ARECF>" };
    },
    entregarAprobacion: async () => ({ entregada: true }),
  };
  const s = crearServicioEntrega({
    rncPropio: EMISOR_PRUEBA.rnc,
    dgii: { consultarDirectorio: async () => directorio },
    contribuyente,
  });
  return { s, entregas };
}

const xml = construirXmlEcf(creditoFiscalPrueba(), AHORA);

describe("servicio de entrega al comprador", () => {
  it("entrega al comprador electrónico y devuelve su acuse", async () => {
    const { s, entregas } = servicio(DIRECTORIO);
    const r = await s.entregar({ encf: "E310000000001", rncComprador: "101010101", xmlFirmado: xml });
    expect(r).toEqual({ electronico: true, recibido: true, acuseXml: "<ARECF/>" });
    expect(entregas).toEqual(["131880738E310000000001.xml"]);
  });

  it("un acuse negativo devuelve el motivo", async () => {
    const { s } = servicio(DIRECTORIO, false);
    const r = await s.entregar({ encf: "E310000000001", rncComprador: "101010101", xmlFirmado: xml });
    expect(r).toEqual({ electronico: true, recibido: false, motivo: 2, acuseXml: "<ARECF>no</ARECF>" });
  });

  it("si el comprador no está en el directorio no es electrónico", async () => {
    const { s, entregas } = servicio(null);
    expect(await s.entregar({ encf: "E310000000001", rncComprador: "101010101", xmlFirmado: xml })).toEqual({
      electronico: false,
    });
    expect(entregas).toEqual([]);
  });

  it("solo reenvía e-CF propios: rechaza XML de otro emisor o de otro e-NCF", async () => {
    const { s } = servicio(DIRECTORIO);
    const ajeno = construirXmlEcf(creditoFiscalPrueba({ emisor: { ...EMISOR_PRUEBA, rnc: "130000002" } }), AHORA);
    await expect(
      s.entregar({ encf: "E310000000001", rncComprador: "101010101", xmlFirmado: ajeno }),
    ).rejects.toBeInstanceOf(DocumentoFiscalInvalidoError);
    await expect(
      s.entregar({ encf: "E310000000099", rncComprador: "101010101", xmlFirmado: xml }),
    ).rejects.toBeInstanceOf(DocumentoFiscalInvalidoError);
  });
});
