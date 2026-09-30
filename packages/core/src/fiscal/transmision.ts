import { ValidacionError } from "../repos/producto-repo.js";
import type { NcfAnulacionRepo } from "../repos/ncf-anulacion-repo.js";
import type { EstadoDgii, Negocio } from "../repos/tipos.js";
import type {
  ComprobanteATransmitir,
  EmisorFiscal,
  EstadoTransmision,
  ProveedorFiscal,
  ResultadoTransmision,
} from "./proveedor.js";

export const UMBRAL_CONSUMO_CON_COMPRADOR = 250_000;

export function emisorDesdeNegocio(
  negocio: Pick<Negocio, "rnc" | "razon_social" | "nombre_comercial" | "direccion"> | null | undefined,
): EmisorFiscal | null {
  if (!negocio) return null;
  return {
    rnc: negocio.rnc?.trim() ?? "",
    razonSocial: negocio.razon_social?.trim() ?? "",
    nombreComercial: negocio.nombre_comercial?.trim() || null,
    direccion: negocio.direccion?.trim() ?? "",
  };
}

export function validarEmisor(emisor: EmisorFiscal | null | undefined): EmisorFiscal {
  const completo = emisor && emisor.rnc.trim() && emisor.razonSocial.trim() && emisor.direccion.trim();
  if (!completo) {
    throw new ValidacionError([
      {
        campo: "emisor",
        mensaje:
          "Complete el RNC, la razón social y la dirección del negocio en Configuración antes de emitir comprobantes fiscales.",
      },
    ]);
  }
  return emisor;
}

export function estadoDgiiDe(estado: EstadoTransmision): EstadoDgii {
  return estado === "en_proceso" ? "pendiente" : estado;
}

export interface TransmisionDeps {
  proveedorFiscal: ProveedorFiscal;
  anulacionRepo: NcfAnulacionRepo;
}

/**
 * Transmite un comprobante cuyo e-NCF ya fue consumido. Si no llega a tener
 * validez fiscal (sin conexión o rechazado), el número queda en cola para
 * anularlo ante la DGII y se corta la operación con un ValidacionError.
 */
export async function transmitirNcfConsumido(
  deps: TransmisionDeps,
  comprobante: ComprobanteATransmitir,
  documento: string,
): Promise<ResultadoTransmision> {
  let resultado: ResultadoTransmision;
  try {
    resultado = await deps.proveedorFiscal.transmitir(comprobante);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    await deps.anulacionRepo.registrar({
      tipoEcf: comprobante.tipoEcf,
      ncf: comprobante.ncf,
      motivo: `No transmitido: ${detalle}`,
    });
    throw new ValidacionError([
      {
        campo: "fiscal",
        mensaje: `No se pudo transmitir ${documento} a la DGII: ${detalle}. No se permite emitir comprobantes fiscales sin respuesta de la DGII; puede reintentar o cobrar sin comprobante fiscal.`,
      },
    ]);
  }

  if (resultado.estado === "rechazado") {
    const motivo = resultado.motivoRechazo ?? "sin detalle";
    await deps.anulacionRepo.registrar({
      tipoEcf: comprobante.tipoEcf,
      ncf: comprobante.ncf,
      motivo: `Rechazado por la DGII: ${motivo}`,
    });
    throw new ValidacionError([{ campo: "fiscal", mensaje: `La DGII rechazó ${documento}: ${motivo}.` }]);
  }

  return resultado;
}
