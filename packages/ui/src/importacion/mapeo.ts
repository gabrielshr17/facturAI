import { normalizar, type ImpuestoTipo, type TipoVenta } from "@sfr/core";

export type CampoDestino =
  | "descripcion"
  | "codigo_barra"
  | "costo"
  | "precio_venta"
  | "precio_mayoreo"
  | "impuesto_tipo"
  | "existencia"
  | "departamento"
  | "tipo_venta"
  | "unidad_medida"
  | "ignorar";

export const ETIQUETA_CAMPO: Record<CampoDestino, string> = {
  descripcion: "Descripción",
  codigo_barra: "Código de barra",
  costo: "Costo",
  precio_venta: "Precio de venta",
  precio_mayoreo: "Precio mayoreo",
  impuesto_tipo: "Impuesto",
  existencia: "Existencia",
  departamento: "Departamento",
  tipo_venta: "Tipo de venta (unidad/granel)",
  unidad_medida: "Unidad de medida",
  ignorar: "(No importar)",
};

const PISTAS: Record<Exclude<CampoDestino, "ignorar">, string[]> = {
  descripcion: ["descripcion", "nombre", "producto", "articulo", "item"],
  codigo_barra: ["codigo", "barra", "sku", "upc", "ean"],
  costo: ["costo", "cost"],
  precio_venta: ["preciovent", "pventa", "pvp", "price", "precio"],
  precio_mayoreo: ["mayoreo", "mayorista", "wholesale"],
  impuesto_tipo: ["impuesto", "itbis", "tax", "iva"],
  existencia: ["existencia", "stock", "cantidad", "inventario", "qty"],
  departamento: ["departamento", "categoria", "category", "familia"],
  tipo_venta: ["tipodeventa", "tipoventa", "salestype"],
  unidad_medida: ["unidadmedida", "unidaddemedida", "unitofmeasure", "um"],
};

/** Encabezados abreviados como "P. Venta" o "P.Costo" deben matchear igual que "precio venta"/"costo": se quita todo lo que no sea letra/número antes de buscar las pistas. */
function normalizarEncabezado(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9]/g, "");
}

/** Adivina a qué campo del producto corresponde cada columna, por nombre. */
export function adivinarMapeo(columnas: string[]): Record<string, CampoDestino> {
  const usados = new Set<CampoDestino>();
  const mapeo: Record<string, CampoDestino> = {};
  for (const col of columnas) {
    const n = normalizarEncabezado(col);
    let encontrado: CampoDestino = "ignorar";
    for (const [campo, pistas] of Object.entries(PISTAS) as [CampoDestino, string[]][]) {
      if (usados.has(campo)) continue;
      if (pistas.some((p) => n.includes(p))) {
        encontrado = campo;
        break;
      }
    }
    mapeo[col] = encontrado;
    if (encontrado !== "ignorar") usados.add(encontrado);
  }
  return mapeo;
}

/** Normaliza valores libres de impuesto ("18%", "Exento", "0.18"...) al tipo interno. Por defecto itbis18. */
export function normalizarImpuesto(valor: string | number | null): ImpuestoTipo {
  const t = normalizar(String(valor ?? "").trim());
  if (!t) return "itbis18";
  if (t.includes("exent") || t === "0" || t === "0%") return "exento";
  if (t.includes("16")) return "itbis16";
  if (t.includes("18")) return "itbis18";
  return "itbis18";
}

/** Normaliza valores libres de tipo de venta ("GRANEL", "Por unidad", "Paquete"...) al tipo interno. Por defecto "unidad". */
export function normalizarTipoVenta(valor: string | number | null): TipoVenta {
  const t = normalizar(String(valor ?? "").trim());
  if (!t) return "unidad";
  if (t.includes("granel") || t.includes("peso") || t.includes("libra") || t.includes("weight")) return "granel";
  if (t.includes("paquete") || t.includes("pack")) return "paquete";
  if (t.includes("kit")) return "kit";
  return "unidad";
}

/** Busca en `mapeo` la columna asignada a `campo` (o undefined si ninguna). */
export function columnaDe(mapeo: Record<string, CampoDestino>, campo: CampoDestino): string | undefined {
  return Object.entries(mapeo).find(([, v]) => v === campo)?.[0];
}
