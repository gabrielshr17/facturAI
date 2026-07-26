import type { TipoEcf } from "../dominio/ecf.js";

/**
 * Puerto de transmisión fiscal. Cualquier implementación real (PAC certificado
 * o integración directa al API de la DGII — decisión pendiente del usuario,
 * ver `plan.md`) implementa esta interfaz. El resto del sistema (secuencias,
 * NCF, recibo) no depende de cuál se elija.
 */
export interface ComprobanteATransmitir {
  ncf: string;
  tipoEcf: TipoEcf;
  rncEmisor: string | null;
  receptorDocumentoTipo: "rnc" | "cedula" | null;
  receptorDocumentoNumero: string | null;
  montoGravado: number;
  montoExento: number;
  montoItbis: number;
  total: number;
}

export interface ResultadoTransmision {
  estado: "aceptado" | "rechazado";
  trackId?: string;
  codigoSeguridad?: string;
  motivoRechazo?: string;
}

export interface ProveedorFiscal {
  transmitir(comprobante: ComprobanteATransmitir): Promise<ResultadoTransmision>;
}

/**
 * *** SIMULADOR — NO transmite nada real a la DGII. ***
 *
 * Placeholder mientras se decide el proveedor real (PAC vs. integración
 * directa, pendiente de confirmar). Simula una aceptación instantánea para
 * poder construir y probar el flujo completo de e-CF (secuencias, NCF,
 * recibo) sin conexión real. Sustituir por una implementación real de
 * `ProveedorFiscal` antes de emitir comprobantes en producción.
 */
export function crearProveedorFiscalSimulado(): ProveedorFiscal {
  return {
    async transmitir(_comprobante) {
      return {
        estado: "aceptado",
        trackId: `SIM-${Date.now()}`,
        codigoSeguridad: Math.random().toString(36).slice(2, 10).toUpperCase(),
      };
    },
  };
}
