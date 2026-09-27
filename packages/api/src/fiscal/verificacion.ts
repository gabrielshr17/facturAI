import forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const OID_SERIAL_SUJETO = "2.5.4.5";

export type ResultadoVerificacion =
  { valido: true } | { valido: false; motivo: "especificacion" | "firma"; detalle: string };

type Documento = ReturnType<DOMParser["parseFromString"]>;

function parsear(xml: string): Documento | null {
  try {
    const doc = new DOMParser({
      onError: (nivel, mensaje) => {
        if (nivel !== "warning") throw new Error(mensaje);
      },
    }).parseFromString(xml, "text/xml");
    return doc.documentElement ? doc : null;
  } catch {
    return null;
  }
}

function serialSujeto(certificadoPem: string): string {
  try {
    const cert = forge.pki.certificateFromPem(certificadoPem);
    return String(cert.subject.attributes.find((a) => a.type === OID_SERIAL_SUJETO)?.value ?? "");
  } catch {
    return "";
  }
}

/**
 * Verifica un documento recibido de otro contribuyente (e-CF, ACECF): la firma debe cubrir el
 * documento entero (`Reference URI=""`) y el certificado incluido debe pertenecer al RNC que
 * dice emitirlo (campo SN). Sin lo segundo, cualquiera podría firmar a nombre de otro.
 */
export function verificarDocumentoFirmado(xml: string, rncFirmante: string): ResultadoVerificacion {
  const doc = parsear(xml);
  if (!doc) return { valido: false, motivo: "especificacion", detalle: "El archivo no es un XML válido." };

  const firmas = doc.getElementsByTagNameNS(XMLDSIG, "Signature");
  if (firmas.length !== 1) {
    return { valido: false, motivo: "firma", detalle: "El documento debe tener exactamente una firma digital." };
  }
  const firma = firmas[0]!;
  const referencias = firma.getElementsByTagNameNS(XMLDSIG, "Reference");
  if (referencias.length !== 1 || referencias[0]!.getAttribute("URI") !== "") {
    return { valido: false, motivo: "firma", detalle: "La firma no cubre el documento completo." };
  }

  const keyInfo = firma.getElementsByTagNameNS(XMLDSIG, "KeyInfo")[0] ?? null;
  const certificadoPem = SignedXml.getCertFromKeyInfo(keyInfo as unknown as Node | null);
  if (!certificadoPem) return { valido: false, motivo: "firma", detalle: "La firma no incluye el certificado." };

  let integra = false;
  try {
    const verificador = new SignedXml({ publicCert: certificadoPem });
    verificador.loadSignature(firma as unknown as Node);
    integra = verificador.checkSignature(xml);
  } catch (error) {
    return {
      valido: false,
      motivo: "firma",
      detalle: `Firma inválida: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!integra) return { valido: false, motivo: "firma", detalle: "El documento fue alterado después de firmado." };

  if (!serialSujeto(certificadoPem).replace(/\D/g, "").includes(rncFirmante)) {
    return { valido: false, motivo: "firma", detalle: `El certificado no pertenece al RNC ${rncFirmante}.` };
  }
  return { valido: true };
}

export interface EcfRecibido {
  tipoEcf: string;
  encf: string;
  rncEmisor: string;
  razonSocialEmisor: string;
  rncComprador: string | null;
  fechaEmision: string;
  montoTotal: number;
  totalItbis: number;
}

function valor(doc: Documento, etiqueta: string): string | null {
  return doc.getElementsByTagName(etiqueta)[0]?.textContent?.trim() || null;
}

export function leerEcfRecibido(xml: string): EcfRecibido | null {
  const doc = parsear(xml);
  if (!doc || doc.documentElement?.nodeName !== "ECF") return null;
  const encf = valor(doc, "eNCF");
  const rncEmisor = valor(doc, "RNCEmisor");
  const fechaEmision = valor(doc, "FechaEmision");
  const montoTotal = valor(doc, "MontoTotal");
  if (!encf || !rncEmisor || !fechaEmision || !montoTotal) return null;
  return {
    tipoEcf: valor(doc, "TipoeCF") ?? encf.slice(1, 3),
    encf,
    rncEmisor,
    razonSocialEmisor: valor(doc, "RazonSocialEmisor") ?? "",
    rncComprador: valor(doc, "RNCComprador"),
    fechaEmision,
    montoTotal: Number(montoTotal),
    totalItbis: Number(valor(doc, "TotalITBIS") ?? 0),
  };
}
