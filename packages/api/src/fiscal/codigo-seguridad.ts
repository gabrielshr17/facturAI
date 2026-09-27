export function codigoSeguridad(xmlFirmado: string): string {
  const signatureValue = /<SignatureValue>\s*([^<\s]+)/.exec(xmlFirmado)?.[1];
  if (!signatureValue || signatureValue.length < 6) {
    throw new Error("El XML no contiene un SignatureValue del cual extraer el código de seguridad.");
  }
  return signatureValue.slice(0, 6);
}
