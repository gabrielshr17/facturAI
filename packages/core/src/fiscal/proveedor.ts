import type { TipoEcf } from "../dominio/ecf.js";
import type { MetodoPago } from "../dominio/factura.js";

/**
 * Puerto de transmisión fiscal. La implementación real vive en `@sfr/api`
 * (integración directa al API de la DGII, "Software de Desarrollo Propio"):
 * el cliente la consume vía HTTP. El resto del sistema (secuencias, NCF,
 * recibo) no depende de cómo se transmite.
 */
export interface EmisorFiscal {
  rnc: string;
  razonSocial: string;
  nombreComercial: string | null;
  direccion: string;
}

/** Línea tal como se vendió: `precioUnitario` y `subtotal` llevan el ITBIS incluido. */
export interface LineaATransmitir {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  tasaImpuesto: number;
  subtotal: number;
}

export interface PagoATransmitir {
  metodo: MetodoPago;
  monto: number;
}

/**
 * Códigos DGII: 1 anula el NCF modificado, 2 corrige texto, 3 corrige montos,
 * 4 reemplaza un NCF emitido en contingencia, 5 referencia una factura de consumo electrónica.
 */
export type CodigoModificacion = 1 | 2 | 3 | 4 | 5;

export interface ReferenciaComprobante {
  ncfModificado: string;
  /** Fecha ISO de emisión del comprobante modificado. */
  fechaNcfModificado: string;
  codigoModificacion: CodigoModificacion;
  razon: string | null;
}

export interface ComprobanteATransmitir {
  ncf: string;
  tipoEcf: TipoEcf;
  emisor: EmisorFiscal;
  /** Fecha ISO de emisión. */
  fechaEmision: string;
  /** Fecha ISO (AAAA-MM-DD) de vencimiento de la secuencia; la DGII la exige en E31. */
  fechaVencimientoSecuencia: string | null;
  receptorDocumentoTipo: "rnc" | "cedula" | null;
  receptorDocumentoNumero: string | null;
  receptorNombre: string | null;
  lineas: LineaATransmitir[];
  pagos: PagoATransmitir[];
  montoGravado: number;
  montoExento: number;
  montoItbis: number;
  total: number;
  /** Obligatoria en notas de crédito/débito (E33/E34). */
  referencia: ReferenciaComprobante | null;
}

/**
 * Estados de la DGII: `aceptado_condicional` tiene validez fiscal igual que
 * `aceptado`; `en_proceso` significa que la DGII aún no valida y hay que
 * consultar luego por `trackId`.
 */
export type EstadoTransmision = "aceptado" | "aceptado_condicional" | "en_proceso" | "rechazado";

export interface ResultadoTransmision {
  estado: EstadoTransmision;
  trackId?: string;
  codigoSeguridad?: string;
  /** Fecha y hora de la firma en formato DGII (dd-MM-AAAA HH:mm:ss). */
  fechaFirma?: string;
  qrUrl?: string;
  xmlFirmado?: string;
  motivoRechazo?: string;
}

export interface ProveedorFiscal {
  transmitir(comprobante: ComprobanteATransmitir): Promise<ResultadoTransmision>;
}

export function tieneValidezFiscal(estado: EstadoTransmision): boolean {
  return estado === "aceptado" || estado === "aceptado_condicional";
}

/**
 * *** SIMULADOR — NO transmite nada real a la DGII. ***
 *
 * Simula una aceptación instantánea para desarrollar y probar el flujo
 * completo sin conexión ni certificado. Usar `crearProveedorFiscalHttp` (en
 * `@sfr/ui`) para emitir comprobantes reales.
 */
export function crearProveedorFiscalSimulado(): ProveedorFiscal {
  return {
    async transmitir(_comprobante) {
      return {
        estado: "aceptado",
        trackId: `SIM-${Date.now()}`,
        codigoSeguridad: Math.random().toString(36).slice(2, 8).toUpperCase(),
      };
    },
  };
}
