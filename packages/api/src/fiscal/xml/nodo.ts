export type Nodo = [etiqueta: string, contenido: string | Nodo[] | null | undefined];

const ENTIDADES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export function escaparXml(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c);
}

export function texto(valor: string | null | undefined, maximo?: number): string | null {
  if (valor === null || valor === undefined) return null;
  const limpio = valor.trim();
  if (limpio === "") return null;
  return maximo ? limpio.slice(0, maximo) : limpio;
}

export const CONTENEDORES_OBLIGATORIOS = new Set(["Comprador"]);

export function renderizar(nodos: Nodo[]): string {
  return nodos
    .map(([etiqueta, contenido]) => {
      if (contenido === null || contenido === undefined) return "";
      if (typeof contenido === "string") return `<${etiqueta}>${escaparXml(contenido)}</${etiqueta}>`;
      const interior = renderizar(contenido);
      if (interior === "" && !CONTENEDORES_OBLIGATORIOS.has(etiqueta)) return "";
      return `<${etiqueta}>${interior}</${etiqueta}>`;
    })
    .join("");
}

export function documentoXml(raiz: string, hijos: Nodo[]): string {
  return `<?xml version="1.0" encoding="utf-8"?><${raiz}>${renderizar(hijos)}</${raiz}>`;
}
