import { DOMParser } from "@xmldom/xmldom";
import { escaparXml } from "../xml/nodo.js";
import type { NodoEsquema } from "./esquema.js";

/**
 * Una fila del set de pruebas DGII: columna → valor. Convención de columnas (a confirmar con el
 * Excel real que entrega la DGII, ver plan-ecf.md E2):
 *   - `Etiqueta` para campos que no se repiten (`RNCEmisor`, `MontoTotal`).
 *   - `Etiqueta[i]` dentro de un grupo repetible (`NombreItem[2]`, `FormaPago[1]`);
 *     `Etiqueta[i][j]` si hay grupos repetibles anidados.
 *   - `Padre.Etiqueta[i]` desambigua etiquetas repetidas en el XSD (el único caso real es
 *     `DescuentoORecargo.NumeroLinea[i]`, que choca con `NumeroLinea[i]` de los ítems).
 */
export type FilaSetPruebas = Record<string, string>;

export interface XmlGenerado {
  xml: string;
  /** Columnas con valor que no se usaron: señal de que el mapeo de columnas no coincide. */
  columnasSinUsar: string[];
}

const LIMITE_REPETICIONES = 1000;

function sufijo(indices: number[]): string {
  return indices.map((i) => `[${i}]`).join("");
}

function hojas(n: NodoEsquema): NodoEsquema[] {
  return n.hijos.length === 0 ? [n] : n.hijos.flatMap(hojas);
}

/** Primer lugar (en orden del XSD) donde aparece cada etiqueta hoja: ahí se acepta el nombre sin padre. */
function duenosDelNombreSimple(raiz: NodoEsquema): Map<string, NodoEsquema> {
  const duenos = new Map<string, NodoEsquema>();
  for (const h of hojas(raiz)) if (!duenos.has(h.nombre)) duenos.set(h.nombre, h);
  return duenos;
}

const MARCADOR_VACIO = "#e";

export function generarXmlDesdeFila(raiz: NodoEsquema, fila: FilaSetPruebas): XmlGenerado {
  const duenos = duenosDelNombreSimple(raiz);
  const usadas = new Set<string>();
  const originales = new Map<string, string>();
  const valores = new Map<string, string>();
  for (const [columna, bruto] of Object.entries(fila)) {
    const valor = String(bruto ?? "").trim();
    if (valor === "" || valor.toLowerCase() === MARCADOR_VACIO) continue;
    const clave = columna.trim().toLowerCase();
    valores.set(clave, valor);
    originales.set(clave, columna.trim());
  }

  function valorHoja(hoja: NodoEsquema, padre: string, indices: number[]): string | null {
    const candidatos = [`${padre}.${hoja.nombre}${sufijo(indices)}`];
    if (duenos.get(hoja.nombre) === hoja) candidatos.push(`${hoja.nombre}${sufijo(indices)}`);
    if (padre === "DescuentoORecargo" && hoja.nombre === "NumeroLinea")
      candidatos.push(`NumeroLineaDoR${sufijo(indices)}`);
    for (const clave of candidatos) {
      const v = valores.get(clave.toLowerCase());
      if (v !== undefined) {
        usadas.add(clave.toLowerCase());
        return v;
      }
    }
    return null;
  }

  function renderizar(n: NodoEsquema, padre: string, indices: number[]): string {
    if (n.maximo > 1) {
      let salida = "";
      for (let i = 1; i <= Math.min(n.maximo, LIMITE_REPETICIONES); i++) {
        const una = renderizarUna(n, padre, [...indices, i]);
        if (!una) break;
        salida += una;
      }
      return salida;
    }
    return renderizarUna(n, padre, indices);
  }

  function interiorDe(n: NodoEsquema, indices: number[]): string {
    const partes = n.hijos.map((h) => ({ h, xml: renderizar(h, n.nombre, indices) }));
    if (!partes.some((p) => p.xml)) return "";
    return partes
      .map(({ h, xml }) =>
        xml || h.hijos.length === 0 || h.minimo < 1 || h.maximo > 1 ? xml : `<${h.nombre}></${h.nombre}>`,
      )
      .join("");
  }

  function renderizarUna(n: NodoEsquema, padre: string, indices: number[]): string {
    if (n.hijos.length === 0) {
      const v = valorHoja(n, padre, indices);
      return v === null ? "" : `<${n.nombre}>${escaparXml(v)}</${n.nombre}>`;
    }
    const interior = interiorDe(n, indices);
    return interior ? `<${n.nombre}>${interior}</${n.nombre}>` : "";
  }

  const cuerpo = `<?xml version="1.0" encoding="utf-8"?><${raiz.nombre}>${interiorDe(raiz, [])}</${raiz.nombre}>`;
  return {
    xml: cuerpo,
    columnasSinUsar: [...valores.keys()].filter((k) => !usadas.has(k)).map((k) => originales.get(k) ?? k),
  };
}

type Elemento = ReturnType<ReturnType<DOMParser["parseFromString"]>["createElement"]>;

/** Inverso de `generarXmlDesdeFila`: útil para inspeccionar un XML con la misma convención de columnas. */
export function aplanarXml(raiz: NodoEsquema, xml: string): FilaSetPruebas {
  const duenos = duenosDelNombreSimple(raiz);
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const fila: FilaSetPruebas = {};

  function hijosElemento(el: Elemento, nombre: string): Elemento[] {
    const res: Elemento[] = [];
    for (let n = el.firstChild; n; n = n.nextSibling) {
      const e = n as Elemento;
      if (e.nodeType === 1 && e.nodeName === nombre) res.push(e);
    }
    return res;
  }

  function recorrer(el: Elemento, n: NodoEsquema, padre: string, indices: number[]): void {
    for (const h of n.hijos) {
      hijosElemento(el, h.nombre).forEach((hijo, i) => {
        const idx = h.maximo > 1 ? [...indices, i + 1] : indices;
        if (h.hijos.length === 0) {
          const clave = duenos.get(h.nombre) === h ? h.nombre : `${n.nombre}.${h.nombre}`;
          fila[`${clave}${sufijo(idx)}`] = hijo.textContent ?? "";
        } else {
          recorrer(hijo, h, n.nombre, idx);
        }
      });
    }
    void padre;
  }

  recorrer(doc.documentElement as unknown as Elemento, raiz, "", []);
  return fila;
}
