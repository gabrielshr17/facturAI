import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

export type EsquemaValidable =
  | "ecf-31"
  | "ecf-32"
  | "ecf-33"
  | "ecf-34"
  | "ecf-41"
  | "ecf-43"
  | "ecf-44"
  | "ecf-45"
  | "ecf-46"
  | "ecf-47"
  | "rfce-32"
  | "anecf"
  | "acecf"
  | "arecf";

/** Valida un XML (firmado) contra el XSD oficial DGII de `packages/api/xsd`. Lista vacía = válido. */
export async function erroresContraXsd(xml: string, esquema: EsquemaValidable): Promise<string[]> {
  const ruta = fileURLToPath(new URL(`../../../xsd/${esquema}.xsd`, import.meta.url));
  const resultado = await validateXML({
    xml: [{ fileName: "documento.xml", contents: xml }],
    schema: [{ fileName: `${esquema}.xsd`, contents: readFileSync(ruta, "utf8") }],
  });
  return resultado.errors.map((e) => e.rawMessage);
}
