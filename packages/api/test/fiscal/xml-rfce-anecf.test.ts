import { describe, expect, it } from "vitest";
import { construirXmlRfce } from "../../src/fiscal/xml/rfce.js";
import { construirXmlAnecf } from "../../src/fiscal/xml/anecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { erroresContraXsd } from "./xsd.js";
import { consumoPrueba } from "./datos-prueba.js";

function firmado(xml: string): string {
  return firmarXml(xml, cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA));
}

describe("XML RFCE (resumen de factura de consumo < RD$250,000)", () => {
  it("cumple el XSD oficial una vez firmado", async () => {
    const xml = construirXmlRfce(consumoPrueba(), "AbC123");
    expect(await erroresContraXsd(firmado(xml), "rfce-32")).toEqual([]);
  });

  it("resume totales y lleva el código de seguridad del e-CF completo", () => {
    const xml = construirXmlRfce(consumoPrueba(), "AbC123");

    expect(xml).toContain(
      "<Totales><MontoGravadoTotal>200.00</MontoGravadoTotal><MontoGravadoI1>200.00</MontoGravadoI1>" +
        "<MontoExento>50.00</MontoExento><TotalITBIS>36.00</TotalITBIS><TotalITBIS1>36.00</TotalITBIS1>" +
        "<MontoTotal>286.00</MontoTotal></Totales><CodigoSeguridadeCF>AbC123</CodigoSeguridadeCF>",
    );
    expect(xml).toContain(
      "<Emisor><RNCEmisor>131880738</RNCEmisor><RazonSocialEmisor>SUPLIDORA MAROHI SRL</RazonSocialEmisor>" +
        "<FechaEmision>01-10-2026</FechaEmision></Emisor>",
    );
    expect(xml).not.toContain("<DetallesItems>");
  });

  it("solo aplica a E32", () => {
    expect(() => construirXmlRfce(consumoPrueba({ tipoEcf: "31" }), "AbC123")).toThrow(/E32/);
  });
});

describe("XML ANECF (anulación de e-NCF no utilizados)", () => {
  const FECHA = new Date("2026-10-01T18:31:05.000Z");

  it("cumple el XSD oficial una vez firmado", async () => {
    const xml = construirXmlAnecf(
      "131880738",
      [{ tipoEcf: "32", desde: "E320000000005", hasta: "E320000000005" }],
      FECHA,
    );
    expect(await erroresContraXsd(firmado(xml), "anecf")).toEqual([]);
  });

  it("agrupa rangos por tipo y cuenta los e-NCF anulados", async () => {
    const xml = construirXmlAnecf(
      "131880738",
      [
        { tipoEcf: "32", desde: "E320000000005", hasta: "E320000000007" },
        { tipoEcf: "34", desde: "E340000000002", hasta: "E340000000002" },
        { tipoEcf: "32", desde: "E320000000010", hasta: "E320000000010" },
      ],
      FECHA,
    );

    expect(xml).toContain(
      "<Encabezado><Version>1.0</Version><RncEmisor>131880738</RncEmisor>" +
        "<CantidadeNCFAnulados>5</CantidadeNCFAnulados>" +
        "<FechaHoraAnulacioneNCF>01-10-2026 14:31:05</FechaHoraAnulacioneNCF></Encabezado>",
    );
    expect(xml).toContain(
      "<Anulacion><NoLinea>1</NoLinea><TipoeCF>32</TipoeCF><TablaRangoSecuenciasAnuladaseNCF>" +
        "<Secuencias><SecuenciaeNCFDesde>E320000000005</SecuenciaeNCFDesde><SecuenciaeNCFHasta>E320000000007</SecuenciaeNCFHasta></Secuencias>" +
        "<Secuencias><SecuenciaeNCFDesde>E320000000010</SecuenciaeNCFDesde><SecuenciaeNCFHasta>E320000000010</SecuenciaeNCFHasta></Secuencias>" +
        "</TablaRangoSecuenciasAnuladaseNCF><CantidadeNCFAnulados>4</CantidadeNCFAnulados></Anulacion>",
    );
    expect(xml).toContain("<Anulacion><NoLinea>2</NoLinea><TipoeCF>34</TipoeCF>");
    expect(await erroresContraXsd(firmado(xml), "anecf")).toEqual([]);
  });

  it("rechaza un rango invertido o de tipos distintos", () => {
    expect(() =>
      construirXmlAnecf("131880738", [{ tipoEcf: "32", desde: "E320000000009", hasta: "E320000000001" }], FECHA),
    ).toThrow(/rango/i);
    expect(() =>
      construirXmlAnecf("131880738", [{ tipoEcf: "32", desde: "E310000000001", hasta: "E310000000002" }], FECHA),
    ).toThrow(/tipo/i);
  });
});
