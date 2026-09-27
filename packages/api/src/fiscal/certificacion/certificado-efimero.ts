import forge from "node-forge";
import type { CertificadoFirma } from "../firma.js";

/**
 * Certificado autofirmado, solo en memoria, para simulacros del set de pruebas antes de tener el
 * .p12 real: permite validar el XML firmado contra el XSD (que exige la firma). La DGII lo
 * rechazaría ("Tipo de certificado no admitido"), por eso nunca se usa para enviar.
 */
export function certificadoEfimero(rnc: string): CertificadoFirma {
  const llaves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const sujeto = [
    { name: "commonName", value: "SIMULACRO SET DE PRUEBAS" },
    { type: "2.5.4.5", value: `RNC${rnc}` },
  ];
  cert.setSubject(sujeto);
  cert.setIssuer(sujeto);
  cert.sign(llaves.privateKey, forge.md.sha256.create());
  return {
    clavePrivadaPem: forge.pki.privateKeyToPem(llaves.privateKey),
    certificadoPem: forge.pki.certificateToPem(cert),
    venceEl: cert.validity.notAfter,
    serialSujeto: `RNC${rnc}`,
  };
}
