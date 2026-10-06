import { readFileSync } from "node:fs";

const PATRON_CERTIFICADO = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

/** Lee un bundle PEM (uno o varios certificados) con las autoridades certificadoras aceptadas. */
export function cargarRaices(ruta: string | null): string[] {
  if (!ruta) return [];
  const raices = readFileSync(ruta, "utf8").match(PATRON_CERTIFICADO) ?? [];
  if (raices.length === 0) throw new Error(`DGII_CA_RAICES_PATH (${ruta}) no contiene certificados PEM.`);
  return raices;
}
