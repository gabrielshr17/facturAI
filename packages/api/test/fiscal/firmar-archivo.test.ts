import { describe, expect, it } from "vitest";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import { cargarCertificado } from "../../src/fiscal/firma.js";
import { firmarArchivoXml, rutaSalidaFirmada } from "../../src/fiscal/firmar-archivo.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";

const POSTULACION = `\uFEFF<?xml version="1.0" encoding="utf-8"?>
<Postulacion xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <PostulacionID>86433</PostulacionID>
  <Contribuyente>
    <RNCContribuyente>132069031</RNCContribuyente>
  </Contribuyente>
  <Software>
    <NombreSoftware>facturAI</NombreSoftware>
    <UrlRecepcion>fe.facturaird.com</UrlRecepcion>
  </Software>
</Postulacion>`;

function verifica(xmlFirmado: string, certificadoPem: string): boolean {
  const doc = new DOMParser().parseFromString(xmlFirmado, "text/xml");
  const firma = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
  if (!firma) return false;
  const verificador = new SignedXml({ publicCert: certificadoPem });
  verificador.loadSignature(firma as unknown as Element);
  return verificador.checkSignature(xmlFirmado);
}

describe("firmarArchivoXml", () => {
  const { p12, certificadoPem } = certificadoPrueba();
  const certificado = cargarCertificado(p12, CLAVE_P12_PRUEBA);

  it("firma el documento completo y la firma verifica con el certificado", () => {
    const firmado = firmarArchivoXml(POSTULACION, certificado);
    expect(verifica(firmado, certificadoPem)).toBe(true);
  });

  it("conserva el contenido y deja una sola declaración XML al inicio, sin BOM", () => {
    const firmado = firmarArchivoXml(POSTULACION, certificado);
    expect(firmado.startsWith('<?xml version="1.0" encoding="utf-8"?><Postulacion')).toBe(true);
    expect(firmado.match(/<\?xml/g)).toHaveLength(1);
    expect(firmado).toContain("<PostulacionID>86433</PostulacionID>");
    expect(firmado).toContain("<UrlRecepcion>fe.facturaird.com</UrlRecepcion>");
    expect(firmado).toMatch(/<\/Software><Signature xmlns="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#">/);
  });

  it("una alteración posterior invalida la firma", () => {
    const firmado = firmarArchivoXml(POSTULACION, certificado).replace("132069031", "132069032");
    expect(verifica(firmado, certificadoPem)).toBe(false);
  });

  it("rechaza un archivo que no es XML con una raíz", () => {
    expect(() => firmarArchivoXml("texto cualquiera", certificado)).toThrow(/XML/);
  });
});

describe("rutaSalidaFirmada", () => {
  it("agrega -firmado antes de la extensión y conserva la carpeta", () => {
    expect(rutaSalidaFirmada("C:\\Users\\saint\\Downloads\\202610085340235.xml")).toBe(
      "C:\\Users\\saint\\Downloads\\202610085340235-firmado.xml",
    );
    expect(rutaSalidaFirmada("/tmp/post.xml")).toBe("/tmp/post-firmado.xml");
  });
});
