import forge from "node-forge";
import { SignedXml } from "xml-crypto";

const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const OID_SERIAL_SUJETO = "2.5.4.5";
const FIRMA_ENVUELTA = "http://www.w3.org/2000/09/xmldsig#enveloped-signature";

export class CertificadoInvalidoError extends Error {
  constructor(motivo: string) {
    super(`Certificado digital inválido: ${motivo}`);
    this.name = "CertificadoInvalidoError";
  }
}

export interface CertificadoFirma {
  clavePrivadaPem: string;
  certificadoPem: string;
  venceEl: Date;
  /** Atributo SN (serialNumber) del sujeto: la DGII exige que corresponda al RNC/cédula del dueño. */
  serialSujeto: string | null;
}

export function cargarCertificado(p12: Buffer, clave: string): CertificadoFirma {
  let archivo: forge.pkcs12.Pkcs12Pfx;
  try {
    archivo = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString("binary")), false, clave);
  } catch (error) {
    throw new CertificadoInvalidoError(
      `no se pudo abrir el .p12 (¿contraseña incorrecta?): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const bolsasClave = archivo.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const bolsaClave =
    bolsasClave[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
    archivo.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
  const bolsaCert = archivo.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];

  if (!bolsaClave?.key) throw new CertificadoInvalidoError("el .p12 no contiene clave privada");
  if (!bolsaCert?.cert) throw new CertificadoInvalidoError("el .p12 no contiene certificado");

  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(bolsaClave.key),
    certificadoPem: forge.pki.certificateToPem(bolsaCert.cert),
    venceEl: bolsaCert.cert.validity.notAfter,
    serialSujeto:
      String(bolsaCert.cert.subject.attributes.find((a) => a.type === OID_SERIAL_SUJETO)?.value ?? "") || null,
  };
}

function compactarXml(xml: string): string {
  return xml.trim().replace(/>\s+</g, "><");
}

export function firmarXml(xml: string, certificado: CertificadoFirma): string {
  const firma = new SignedXml({
    privateKey: certificado.clavePrivadaPem,
    publicCert: certificado.certificadoPem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: C14N,
  });
  firma.addReference({
    xpath: "/*",
    digestAlgorithm: SHA256,
    transforms: [FIRMA_ENVUELTA],
    isEmptyUri: true,
  });
  firma.computeSignature(compactarXml(xml), { location: { reference: "/*", action: "append" } });
  return firma.getSignedXml();
}
