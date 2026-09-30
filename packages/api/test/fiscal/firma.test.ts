import { describe, expect, it } from "vitest";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import { cargarCertificado, firmarXml, CertificadoInvalidoError } from "../../src/fiscal/firma.js";
import { codigoSeguridad } from "../../src/fiscal/codigo-seguridad.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";

const XML_BASE = '<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><eNCF>E320000000001</eNCF></Encabezado></ECF>';

function firmaDe(xmlFirmado: string): Element {
  const doc = new DOMParser().parseFromString(xmlFirmado, "text/xml");
  const firma = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
  if (!firma) throw new Error("sin firma");
  return firma as unknown as Element;
}

describe("firma XMLDSig con certificado .p12", () => {
  const { p12, certificadoPem } = certificadoPrueba();

  it("firma el documento completo y la firma verifica con el certificado", () => {
    const cert = cargarCertificado(p12, CLAVE_P12_PRUEBA);
    const firmado = firmarXml(XML_BASE, cert);

    const verificador = new SignedXml({ publicCert: certificadoPem });
    verificador.loadSignature(firmaDe(firmado));
    expect(verificador.checkSignature(firmado)).toBe(true);
  });

  it("usa RSA-SHA256, C14N, firma envuelta con URI vacía y agrega el X509 al final del ECF", () => {
    const firmado = firmarXml(XML_BASE, cargarCertificado(p12, CLAVE_P12_PRUEBA));

    expect(firmado).toContain('<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"');
    expect(firmado).toContain('<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"');
    expect(firmado).toContain('<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"');
    expect(firmado).toContain('<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"');
    expect(firmado).toContain('<Reference URI="">');
    expect(firmado).toContain("<X509Certificate>");
    expect(firmado).toMatch(
      /<\/Encabezado><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">.*<\/Signature><\/ECF>$/s,
    );
  });

  it("una alteración posterior del contenido invalida la firma", () => {
    const firmado = firmarXml(XML_BASE, cargarCertificado(p12, CLAVE_P12_PRUEBA));
    const alterado = firmado.replace("E320000000001", "E320000000002");

    const verificador = new SignedXml({ publicCert: certificadoPem });
    verificador.loadSignature(firmaDe(alterado));
    expect(verificador.checkSignature(alterado)).toBe(false);
  });

  it("descarta los espacios entre etiquetas antes de firmar, como exige la DGII", () => {
    const semillaConFormato =
      '<?xml version="1.0" encoding="utf-8"?>\r\n<SemillaModel>\r\n  <valor>abc def</valor>\r\n  <fecha>2026-10-01</fecha>\r\n</SemillaModel>';
    const firmado = firmarXml(semillaConFormato, cargarCertificado(p12, CLAVE_P12_PRUEBA));

    expect(firmado).toContain("<SemillaModel><valor>abc def</valor><fecha>2026-10-01</fecha><Signature");
    const verificador = new SignedXml({ publicCert: certificadoPem });
    verificador.loadSignature(firmaDe(firmado));
    expect(verificador.checkSignature(firmado)).toBe(true);
  });

  it("rechaza una contraseña incorrecta con un error propio", () => {
    expect(() => cargarCertificado(p12, "otra-clave")).toThrow(CertificadoInvalidoError);
  });

  it("el código de seguridad son los primeros 6 caracteres del SignatureValue", () => {
    const firmado = firmarXml(XML_BASE, cargarCertificado(p12, CLAVE_P12_PRUEBA));
    const signatureValue = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(firmado)?.[1] ?? "";

    expect(signatureValue.length).toBeGreaterThan(6);
    expect(codigoSeguridad(firmado)).toBe(signatureValue.slice(0, 6));
  });
});
