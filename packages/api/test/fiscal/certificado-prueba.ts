import forge from "node-forge";

export const CLAVE_P12_PRUEBA = "clave-de-prueba";

export interface CertificadoPrueba {
  p12: Buffer;
  certificadoPem: string;
}

let cache: CertificadoPrueba | undefined;

export function certificadoPrueba(): CertificadoPrueba {
  if (cache) return cache;
  const llaves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = llaves.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const sujeto = [
    { name: "commonName", value: "SUPLIDORA DE PRUEBA SRL" },
    { name: "countryName", value: "DO" },
  ];
  cert.setSubject(sujeto);
  cert.setIssuer(sujeto);
  cert.sign(llaves.privateKey, forge.md.sha256.create());

  const asn1 = forge.pkcs12.toPkcs12Asn1(llaves.privateKey, [cert], CLAVE_P12_PRUEBA, { algorithm: "3des" });
  const der = forge.asn1.toDer(asn1).getBytes();
  cache = { p12: Buffer.from(der, "binary"), certificadoPem: forge.pki.certificateToPem(cert) };
  return cache;
}
