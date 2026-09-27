import { describe, expect, it } from "vitest";
import { verificarDocumentoFirmado, leerEcfRecibido } from "../../src/fiscal/verificacion.js";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { creditoFiscalPrueba } from "./datos-prueba.js";

const FIRMA = new Date("2026-10-01T18:31:05.000Z");

function ecfFirmadoPor(serialSujeto: string): string {
  const cert = cargarCertificado(certificadoPrueba(serialSujeto).p12, CLAVE_P12_PRUEBA);
  return firmarXml(construirXmlEcf(creditoFiscalPrueba(), FIRMA), cert);
}

describe("verificación de documentos recibidos", () => {
  it("acepta un e-CF firmado por un certificado del RNC emisor", () => {
    expect(verificarDocumentoFirmado(ecfFirmadoPor("RNC131880738"), "131880738")).toEqual({ valido: true });
  });

  it("rechaza un e-CF alterado después de firmado", () => {
    const alterado = ecfFirmadoPor("RNC131880738").replace("<MontoTotal>286.00", "<MontoTotal>1.00");
    expect(verificarDocumentoFirmado(alterado, "131880738")).toMatchObject({ valido: false, motivo: "firma" });
  });

  it("rechaza una firma válida hecha con el certificado de otro contribuyente", () => {
    expect(verificarDocumentoFirmado(ecfFirmadoPor("RNC101010101"), "131880738")).toMatchObject({
      valido: false,
      motivo: "firma",
    });
  });

  it("rechaza un documento sin firma o que no es XML", () => {
    expect(verificarDocumentoFirmado(construirXmlEcf(creditoFiscalPrueba(), FIRMA), "131880738")).toMatchObject({
      valido: false,
    });
    expect(verificarDocumentoFirmado("esto no es xml", "131880738")).toMatchObject({ valido: false });
  });
});

describe("lectura de un e-CF recibido", () => {
  it("extrae emisor, comprador, e-NCF, fecha y montos", () => {
    expect(leerEcfRecibido(ecfFirmadoPor("RNC131880738"))).toEqual({
      tipoEcf: "31",
      encf: "E310000000001",
      rncEmisor: "131880738",
      razonSocialEmisor: "SUPLIDORA MAROHI SRL",
      rncComprador: "101010101",
      fechaEmision: "01-10-2026",
      montoTotal: 286,
      totalItbis: 36,
    });
  });

  it("devuelve null si el XML no es un e-CF", () => {
    expect(leerEcfRecibido("<Otra/>")).toBeNull();
    expect(leerEcfRecibido("no es xml")).toBeNull();
  });
});
