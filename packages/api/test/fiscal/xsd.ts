import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateXML } from "xmllint-wasm";

export type EsquemaDgii = "ecf-31" | "ecf-32" | "ecf-34" | "rfce-32" | "anecf" | "acecf" | "arecf";

export async function erroresContraXsd(xml: string, esquema: EsquemaDgii): Promise<string[]> {
  const ruta = fileURLToPath(new URL(`./xsd/${esquema}.xsd`, import.meta.url));
  const resultado = await validateXML({
    xml: [{ fileName: "documento.xml", contents: xml }],
    schema: [{ fileName: `${esquema}.xsd`, contents: readFileSync(ruta, "utf8") }],
  });
  return resultado.errors.map((e) => e.rawMessage);
}
