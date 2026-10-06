import type { CompraLinea, Proveedor, RetencionLineaInput, TipoEcfDeCompra } from "@sfr/core";

export interface EntradaRetencion {
  esServicio: boolean;
  itbisRetenido: string;
  isrRetenido: string;
}

export interface TipoDisponible {
  tipo: TipoEcfDeCompra;
  motivoNoDisponible: string | null;
}

type LineaDeCompra = Pick<CompraLinea, "id" | "tasa_impuesto">;

const SOLO_EXENTOS = "Solo admite artículos exentos de ITBIS.";

function motivoE41(proveedor: Pick<Proveedor, "rnc"> | null): string | null {
  if (!proveedor) return "Requiere un proveedor en la compra.";
  return proveedor.rnc?.trim() ? null : "El proveedor necesita RNC o cédula.";
}

export function tiposDisponibles(lineas: LineaDeCompra[], proveedor: Pick<Proveedor, "rnc"> | null): TipoDisponible[] {
  const hayGravadas = lineas.some((l) => l.tasa_impuesto !== 0);
  return [
    { tipo: "41", motivoNoDisponible: motivoE41(proveedor) },
    { tipo: "43", motivoNoDisponible: hayGravadas ? SOLO_EXENTOS : null },
    {
      tipo: "47",
      motivoNoDisponible: hayGravadas
        ? SOLO_EXENTOS
        : proveedor
          ? null
          : "Requiere el proveedor del exterior en la compra.",
    },
  ];
}

function monto(texto: string | undefined): number | undefined {
  if (texto === undefined || texto.trim() === "") return undefined;
  const valor = Number(texto);
  return Number.isFinite(valor) ? valor : undefined;
}

export function armarRetenciones(
  tipo: TipoEcfDeCompra,
  lineas: LineaDeCompra[],
  entradas: Record<string, EntradaRetencion>,
): Record<string, RetencionLineaInput> {
  if (tipo === "43") return {};
  const retenciones: Record<string, RetencionLineaInput> = {};
  for (const linea of lineas) {
    const entrada = entradas[linea.id];
    const esServicio = entrada?.esServicio ?? false;
    const retencion: RetencionLineaInput = { esServicio };
    const isr = esServicio ? monto(entrada?.isrRetenido) : undefined;
    if (tipo === "47") {
      retencion.isrRetenido = isr ?? 0;
    } else {
      const itbis = linea.tasa_impuesto === 0 ? undefined : monto(entrada?.itbisRetenido);
      if (itbis !== undefined) retencion.itbisRetenido = itbis;
      if (isr !== undefined) retencion.isrRetenido = isr;
    }
    retenciones[linea.id] = retencion;
  }
  return retenciones;
}
