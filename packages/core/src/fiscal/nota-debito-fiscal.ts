import type { SecuenciaNcfRepo } from "../repos/secuencia-ncf-repo.js";
import type { ComprobanteFiscalRepo } from "../repos/comprobante-fiscal-repo.js";
import type { NcfAnulacionRepo } from "../repos/ncf-anulacion-repo.js";
import type { EmisorFiscal, ProveedorFiscal } from "./proveedor.js";
import { redondear2 } from "../dominio/dinero.js";
import { formatearNcf } from "../dominio/ecf.js";
import { ValidacionError } from "../repos/producto-repo.js";
import type { ComprobanteFiscal } from "../repos/tipos.js";
import { MSG } from "../dominio/mensajes.js";
import { now } from "../ids.js";
import { estadoDgiiDe, transmitirNcfConsumido, validarEmisor } from "./transmision.js";

export const TASAS_NOTA_DEBITO = [0, 0.16, 0.18] as const;

export interface NotaDebitoInput {
  comprobanteId: string;
  concepto: string;
  /** Monto del cargo adicional con el ITBIS incluido. */
  monto: number;
  tasaImpuesto: (typeof TASAS_NOTA_DEBITO)[number];
  codigoModificacion: 2 | 3;
  motivo: string | null;
}

export interface NotaDebitoFiscalDeps {
  secuenciaRepo: SecuenciaNcfRepo;
  comprobanteRepo: ComprobanteFiscalRepo;
  anulacionRepo: NcfAnulacionRepo;
  proveedorFiscal: ProveedorFiscal;
}

export interface ResultadoNotaDebitoFiscal {
  comprobante: ComprobanteFiscal;
}

const TIPOS_MODIFICABLES = new Set(["31", "32"]);
const ESTADOS_CON_VALIDEZ = new Set(["aceptado", "aceptado_condicional"]);

function validarEntrada(input: NotaDebitoInput): void {
  if (!input.concepto.trim()) {
    throw new ValidacionError([{ campo: "concepto", mensaje: "Indique el concepto del cargo adicional." }]);
  }
  if (!Number.isFinite(input.monto) || input.monto <= 0 || redondear2(input.monto) !== input.monto) {
    throw new ValidacionError([
      { campo: "monto", mensaje: "El monto debe ser mayor que cero y tener como máximo dos decimales." },
    ]);
  }
  if (!TASAS_NOTA_DEBITO.includes(input.tasaImpuesto)) {
    throw new ValidacionError([{ campo: "tasaImpuesto", mensaje: "La tasa de ITBIS debe ser 0%, 16% o 18%." }]);
  }
}

function validarOriginal(original: ComprobanteFiscal): void {
  if (!TIPOS_MODIFICABLES.has(original.tipo_ecf)) {
    throw new ValidacionError([
      { campo: "comprobante", mensaje: "Solo se puede emitir una nota de débito sobre un E31 o un E32." },
    ]);
  }
  if (!ESTADOS_CON_VALIDEZ.has(original.estado_dgii)) {
    throw new ValidacionError([
      {
        campo: "comprobante",
        mensaje: "El comprobante original aún no tiene validez fiscal ante la DGII; espere su aceptación.",
      },
    ]);
  }
}

function desglose(monto: number, tasa: number): { gravado: number; exento: number; itbis: number } {
  if (tasa === 0) return { gravado: 0, exento: monto, itbis: 0 };
  const gravado = redondear2(monto / (1 + tasa));
  return { gravado, exento: 0, itbis: redondear2(monto - gravado) };
}

/**
 * Emite una Nota de Débito (E33) que aumenta el valor de un comprobante ya
 * aceptado (intereses, flete, ajustes al alza). Mismo orden y política que
 * la nota de crédito: todo se valida antes de consumir el NCF, y si la DGII
 * no lo acepta el número queda en cola para anular.
 */
export async function emitirNotaDebitoFiscal(
  deps: NotaDebitoFiscalDeps,
  input: NotaDebitoInput,
  emisorInput: EmisorFiscal | null,
): Promise<ResultadoNotaDebitoFiscal> {
  const { secuenciaRepo, comprobanteRepo } = deps;
  const emisor = validarEmisor(emisorInput);
  validarEntrada(input);

  const original = await comprobanteRepo.obtener(input.comprobanteId);
  if (!original) throw new Error(MSG.comprobanteNoExiste);
  validarOriginal(original);

  const secuencia = await secuenciaRepo.obtenerVigente("33");
  if (!secuencia) {
    throw new ValidacionError([
      {
        campo: "secuencia",
        mensaje:
          "No hay una secuencia de NCF vigente para Nota de Débito (E33). Configúrela antes de emitir notas de débito.",
      },
    ]);
  }

  const { gravado, exento, itbis } = desglose(input.monto, input.tasaImpuesto);
  const numero = await secuenciaRepo.consumirSiguiente(secuencia.id);
  const ncf = formatearNcf("33", numero);

  const resultadoTransmision = await transmitirNcfConsumido(
    deps,
    {
      ncf,
      tipoEcf: "33",
      emisor,
      fechaEmision: now(),
      fechaVencimientoSecuencia: secuencia.vencimiento,
      receptorDocumentoTipo: original.receptor_documento_tipo,
      receptorDocumentoNumero: original.receptor_documento_numero,
      receptorNombre: original.receptor_nombre,
      lineas: [
        {
          descripcion: input.concepto.trim(),
          cantidad: 1,
          precioUnitario: input.monto,
          tasaImpuesto: input.tasaImpuesto,
          subtotal: input.monto,
        },
      ],
      pagos: [],
      montoGravado: gravado,
      montoExento: exento,
      montoItbis: itbis,
      total: input.monto,
      referencia: {
        ncfModificado: original.ncf,
        fechaNcfModificado: original.fecha_emision,
        codigoModificacion: input.codigoModificacion,
        razon: input.motivo?.trim() || null,
      },
    },
    "la Nota de Débito",
  );

  const comprobante = await comprobanteRepo.crear({
    facturaId: original.factura_id,
    tipoEcf: "33",
    ncf,
    secuenciaId: secuencia.id,
    rncEmisor: emisor.rnc,
    receptorDocumentoTipo: original.receptor_documento_tipo,
    receptorDocumentoNumero: original.receptor_documento_numero,
    receptorNombre: original.receptor_nombre,
    montoGravado: gravado,
    montoExento: exento,
    montoItbis: itbis,
    total: input.monto,
    estadoDgii: estadoDgiiDe(resultadoTransmision.estado),
    trackIdDgii: resultadoTransmision.trackId ?? null,
    codigoSeguridad: resultadoTransmision.codigoSeguridad ?? null,
    qrUrl: resultadoTransmision.qrUrl ?? null,
    fechaFirma: resultadoTransmision.fechaFirma ?? null,
    xmlFirmado: resultadoTransmision.xmlFirmado ?? null,
  });

  return { comprobante };
}
