import { firmarXml, type CertificadoFirma } from "./firma.js";

const DECLARACION_XML = '<?xml version="1.0" encoding="utf-8"?>';

export function firmarArchivoXml(xml: string, certificado: CertificadoFirma): string {
  const sinDeclaracion = xml
    .replace(/^\uFEFF/, "")
    .replace(/^\s*<\?xml[^>]*\?>/, "")
    .trim();
  if (!/^<[A-Za-z_]/.test(sinDeclaracion)) {
    throw new Error("El archivo no parece un XML válido: no tiene un elemento raíz.");
  }
  return `${DECLARACION_XML}${firmarXml(sinDeclaracion, certificado)}`;
}

export function rutaSalidaFirmada(rutaEntrada: string): string {
  return rutaEntrada.replace(/(\.[^.\\/]+)?$/, "-firmado$1");
}
