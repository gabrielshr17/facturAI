import { describe, expect, it } from "vitest";
import forge from "node-forge";
import { verificarDocumentoFirmado, leerEcfRecibido, leerItemsEcf } from "../../src/fiscal/verificacion.js";
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

describe("líneas de un e-CF recibido (para importarlo como compra)", () => {
  it("con montos ITBIS incluido, el costo unitario es el monto del ítem entre la cantidad", () => {
    expect(leerItemsEcf(construirXmlEcf(creditoFiscalPrueba(), FIRMA))).toEqual([
      {
        descripcion: "Arroz Selecto 5lb",
        cantidad: 2,
        costoUnitario: 118,
        impuestoTipo: "itbis18",
        tasaImpuesto: 0.18,
      },
      { descripcion: "Plátano verde", cantidad: 1, costoUnitario: 50, impuestoTipo: "exento", tasaImpuesto: 0 },
    ]);
  });

  it("con montos sin ITBIS (IndicadorMontoGravado 0 o ausente), le suma el ITBIS de la tasa", () => {
    const xml =
      "<ECF><Encabezado><IdDoc><TipoeCF>31</TipoeCF></IdDoc></Encabezado><DetallesItems>" +
      "<Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>2</IndicadorFacturacion><NombreItem>Yogurt</NombreItem>" +
      "<CantidadItem>3</CantidadItem><PrecioUnitarioItem>100</PrecioUnitarioItem><MontoItem>300.00</MontoItem></Item>" +
      "</DetallesItems></ECF>";
    expect(leerItemsEcf(xml)).toEqual([
      { descripcion: "Yogurt", cantidad: 3, costoUnitario: 116, impuestoTipo: "itbis16", tasaImpuesto: 0.16 },
    ]);
  });

  it("un XML ilegible no tiene líneas", () => {
    expect(leerItemsEcf("no es xml")).toEqual([]);
  });
});

describe("verificación contra autoridades certificadoras de confianza", () => {
  function autoridadYCertificado(rnc: string) {
    const clavesCa = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const ca = forge.pki.createCertificate();
    ca.publicKey = clavesCa.publicKey;
    ca.serialNumber = "0A";
    ca.validity.notBefore = new Date(Date.now() - 86_400_000);
    ca.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
    const sujetoCa = [{ name: "commonName", value: "CA DE PRUEBA" }];
    ca.setSubject(sujetoCa);
    ca.setIssuer(sujetoCa);
    ca.setExtensions([{ name: "basicConstraints", cA: true }]);
    ca.sign(clavesCa.privateKey, forge.md.sha256.create());

    const claves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
    const hoja = forge.pki.createCertificate();
    hoja.publicKey = claves.publicKey;
    hoja.serialNumber = "0B";
    hoja.validity.notBefore = ca.validity.notBefore;
    hoja.validity.notAfter = ca.validity.notAfter;
    hoja.setSubject([
      { name: "commonName", value: "EMISOR DE PRUEBA" },
      { type: "2.5.4.5", value: `RNC${rnc}` },
    ]);
    hoja.setIssuer(sujetoCa);
    hoja.sign(clavesCa.privateKey, forge.md.sha256.create());
    return {
      caPem: forge.pki.certificateToPem(ca),
      firma: {
        clavePrivadaPem: forge.pki.privateKeyToPem(claves.privateKey),
        certificadoPem: forge.pki.certificateToPem(hoja),
        venceEl: hoja.validity.notAfter,
        serialSujeto: `RNC${rnc}`,
      },
    };
  }

  it("con raíces configuradas acepta un certificado emitido por ellas", () => {
    const { caPem, firma } = autoridadYCertificado("131880738");
    const xml = firmarXml(construirXmlEcf(creditoFiscalPrueba(), FIRMA), firma);
    expect(verificarDocumentoFirmado(xml, "131880738", { raices: [caPem] })).toEqual({ valido: true });
  });

  it("con raíces configuradas rechaza un certificado autofirmado aunque el SN diga el RNC correcto", () => {
    const { caPem } = autoridadYCertificado("131880738");
    expect(verificarDocumentoFirmado(ecfFirmadoPor("RNC131880738"), "131880738", { raices: [caPem] })).toMatchObject({
      valido: false,
      motivo: "firma",
    });
  });
});
