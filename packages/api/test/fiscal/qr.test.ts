import { describe, expect, it } from "vitest";
import { urlConsultaTimbre, urlConsultaTimbreFc } from "../../src/fiscal/qr.js";

describe("URL del timbre (QR) de la representación impresa", () => {
  it("arma la URL de ConsultaTimbre como en el ejemplo de la DGII", () => {
    const url = urlConsultaTimbre("testecf", {
      rncEmisor: "130000001",
      rncComprador: "130000002",
      encf: "E310000000001",
      fechaEmision: "10-10-2020",
      montoTotal: 2.11,
      fechaFirma: "10-10-2020 09:00:00",
      codigoSeguridad: "dcp79q",
    });
    expect(url).toBe(
      "https://ecf.dgii.gov.do/testecf/consultatimbre?rncemisor=130000001&rnccomprador=130000002" +
        "&encf=E310000000001&fechaemision=10-10-2020&montototal=2.11" +
        "&fechafirma=10-10-2020%2009:00:00&codigoseguridad=dcp79q",
    );
  });

  it("omite rnccomprador cuando el comprador no tiene RNC", () => {
    const url = urlConsultaTimbre("ecf", {
      rncEmisor: "131880738",
      rncComprador: null,
      encf: "E320000000070",
      fechaEmision: "01-10-2026",
      montoTotal: 300000,
      fechaFirma: "01-10-2026 14:05:09",
      codigoSeguridad: "AbC123",
    });
    expect(url).toBe(
      "https://ecf.dgii.gov.do/ecf/consultatimbre?rncemisor=131880738&encf=E320000000070" +
        "&fechaemision=01-10-2026&montototal=300000.00&fechafirma=01-10-2026%2014:05:09&codigoseguridad=AbC123",
    );
  });

  it("arma la URL de ConsultaTimbreFC para consumo menor a RD$250,000", () => {
    const url = urlConsultaTimbreFc("testecf", {
      rncEmisor: "131880738",
      encf: "E320000000064",
      montoTotal: 6225.09,
      codigoSeguridad: "uabnyh",
    });
    expect(url).toBe(
      "https://fc.dgii.gov.do/testecf/consultatimbrefc?rncemisor=131880738&encf=E320000000064" +
        "&montototal=6225.09&codigoseguridad=uabnyh",
    );
  });

  it("escapa caracteres reservados del código de seguridad", () => {
    const url = urlConsultaTimbreFc("certecf", {
      rncEmisor: "131880738",
      encf: "E320000000001",
      montoTotal: 10,
      codigoSeguridad: "a+b/c=",
    });
    expect(url).toContain("codigoseguridad=a%2Bb%2Fc%3D");
    expect(url.startsWith("https://fc.dgii.gov.do/certecf/consultatimbrefc?")).toBe(true);
  });
});
