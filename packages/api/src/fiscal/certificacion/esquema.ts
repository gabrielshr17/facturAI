import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DOMParser } from "@xmldom/xmldom";

const XS = "http://www.w3.org/2001/XMLSchema";

export type NombreEsquema =
  "ecf-31" | "ecf-32" | "ecf-33" | "ecf-34" | "ecf-41" | "ecf-43" | "ecf-44" | "ecf-45" | "ecf-46" | "ecf-47" | "acecf";

export interface NodoEsquema {
  nombre: string;
  minimo: number;
  /** `Infinity` cuando el XSD dice `unbounded`. */
  maximo: number;
  hijos: NodoEsquema[];
}

type Elemento = ReturnType<ReturnType<DOMParser["parseFromString"]>["createElement"]>;

function hijosXs(el: Elemento, nombre: string): Elemento[] {
  const res: Elemento[] = [];
  for (let n = el.firstChild; n; n = n.nextSibling) {
    const e = n as Elemento;
    if (e.nodeType === 1 && e.namespaceURI === XS && e.localName === nombre) res.push(e);
  }
  return res;
}

function secuencia(tipoComplejo: Elemento): Elemento[] {
  const seq = hijosXs(tipoComplejo, "sequence")[0];
  return seq ? hijosXs(seq, "element") : [];
}

/**
 * Árbol de elementos de un XSD oficial DGII, en el orden exacto del `xs:sequence` (el orden que
 * la DGII exige en el XML). Resuelve tipos complejos nombrados y omite `xs:any` (la firma).
 */
export function cargarEsquema(nombre: NombreEsquema): NodoEsquema {
  const ruta = fileURLToPath(new URL(`../../../xsd/${nombre}.xsd`, import.meta.url));
  const doc = new DOMParser().parseFromString(readFileSync(ruta, "utf8"), "text/xml");
  const raiz = doc.documentElement as unknown as Elemento;
  const complejos = new Map<string, Elemento>();
  for (const t of hijosXs(raiz, "complexType")) {
    const n = t.getAttribute("name");
    if (n) complejos.set(n, t);
  }

  function nodo(el: Elemento): NodoEsquema {
    const maxAttr = el.getAttribute("maxOccurs");
    const tipo = el.getAttribute("type");
    const complejo = hijosXs(el, "complexType")[0] ?? (tipo ? complejos.get(tipo) : undefined);
    return {
      nombre: el.getAttribute("name") ?? "",
      minimo: Number(el.getAttribute("minOccurs") ?? "1"),
      maximo: maxAttr === "unbounded" ? Infinity : Number(maxAttr ?? "1"),
      hijos: complejo ? secuencia(complejo).map(nodo) : [],
    };
  }

  const elementoRaiz = hijosXs(raiz, "element")[0];
  if (!elementoRaiz) throw new Error(`El XSD ${nombre} no declara elemento raíz.`);
  return nodo(elementoRaiz);
}

/** Etiquetas hoja que aparecen en más de un lugar con la misma cantidad de índices de repetición. */
export function colisiones(raiz: NodoEsquema): string[] {
  const vistos = new Map<string, Set<string>>();
  function recorrer(n: NodoEsquema, ruta: string[], profundidad: number): void {
    const prof = n.maximo > 1 ? profundidad + 1 : profundidad;
    if (n.hijos.length === 0) {
      const clave = `${n.nombre}#${prof}`;
      if (!vistos.has(clave)) vistos.set(clave, new Set());
      vistos.get(clave)!.add([...ruta, n.nombre].join("/"));
      return;
    }
    for (const h of n.hijos) recorrer(h, [...ruta, n.nombre], prof);
  }
  recorrer(raiz, [], 0);
  return [...vistos.entries()]
    .filter(([, rutas]) => rutas.size > 1)
    .map(([c, rutas]) => `${c}: ${[...rutas].join(" | ")}`);
}
