import { describe, expect, it } from "vitest";
import { construirXmlArecf } from "../../src/fiscal/xml/arecf.js";
import { construirXmlAcecf } from "../../src/fiscal/xml/acecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { erroresContraXsd } from "./xsd.js";

const MOMENTO = new Date("2026-10-01T18:31:05.000Z");

function firmado(xml: string): string {
  return firmarXml(xml, cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA));
}

describe("XML ARECF (acuse de recibo)", () => {
  it("acusa un e-CF recibido y cumple el XSD oficial firmado", async () => {
    const xml = construirXmlArecf(
      { rncEmisor: "101010101", rncComprador: "131880738", encf: "E310000000007", recibido: true },
      MOMENTO,
    );
    expect(xml).toContain(
      "<ARECF><DetalleAcusedeRecibo><Version>1.0</Version><RNCEmisor>101010101</RNCEmisor>" +
        "<RNCComprador>131880738</RNCComprador><eNCF>E310000000007</eNCF><Estado>0</Estado>" +
        "<FechaHoraAcuseRecibo>01-10-2026 14:31:05</FechaHoraAcuseRecibo></DetalleAcusedeRecibo></ARECF>",
    );
    expect(await erroresContraXsd(firmado(xml), "arecf")).toEqual([]);
  });

  it("un e-CF no recibido lleva el código de motivo", async () => {
    const xml = construirXmlArecf(
      { rncEmisor: "101010101", rncComprador: "131880738", encf: "E310000000007", recibido: false, motivo: 4 },
      MOMENTO,
    );
    expect(xml).toContain("<Estado>1</Estado><CodigoMotivoNoRecibido>4</CodigoMotivoNoRecibido>");
    expect(await erroresContraXsd(firmado(xml), "arecf")).toEqual([]);
  });

  it("exige motivo cuando no se recibe", () => {
    expect(() =>
      construirXmlArecf(
        { rncEmisor: "101010101", rncComprador: "131880738", encf: "E310000000007", recibido: false },
        MOMENTO,
      ),
    ).toThrow(/motivo/i);
  });
});

describe("XML ACECF (aprobación comercial)", () => {
  const BASE = {
    rncEmisor: "101010101",
    encf: "E310000000007",
    fechaEmision: "25-09-2026",
    montoTotal: 1180,
    rncComprador: "131880738",
  };

  it("aprueba un e-CF y cumple el XSD oficial firmado", async () => {
    const xml = construirXmlAcecf({ ...BASE, aprobado: true }, MOMENTO);
    expect(xml).toContain(
      "<ACECF><DetalleAprobacionComercial><Version>1.0</Version><RNCEmisor>101010101</RNCEmisor>" +
        "<eNCF>E310000000007</eNCF><FechaEmision>25-09-2026</FechaEmision><MontoTotal>1180.00</MontoTotal>" +
        "<RNCComprador>131880738</RNCComprador><Estado>1</Estado>" +
        "<FechaHoraAprobacionComercial>01-10-2026 14:31:05</FechaHoraAprobacionComercial></DetalleAprobacionComercial></ACECF>",
    );
    expect(await erroresContraXsd(firmado(xml), "acecf")).toEqual([]);
  });

  it("un rechazo comercial exige y lleva el motivo", async () => {
    expect(() => construirXmlAcecf({ ...BASE, aprobado: false }, MOMENTO)).toThrow(/motivo/i);
    const xml = construirXmlAcecf({ ...BASE, aprobado: false, motivoRechazo: "Mercancía no recibida" }, MOMENTO);
    expect(xml).toContain("<Estado>2</Estado><DetalleMotivoRechazo>Mercancía no recibida</DetalleMotivoRechazo>");
    expect(await erroresContraXsd(firmado(xml), "acecf")).toEqual([]);
  });
});
