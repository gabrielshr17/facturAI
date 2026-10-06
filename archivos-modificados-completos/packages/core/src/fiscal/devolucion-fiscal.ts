import type { FacturaRepo } from "../repos/factura-repo.js";
import type { SecuenciaNcfRepo } from "../repos/secuencia-ncf-repo.js";
import type { ComprobanteFiscalRepo } from "../repos/comprobante-fiscal-repo.js";
import type { NcfAnulacionRepo } from "../repos/ncf-anulacion-repo.js";
import type { DevolucionInput, DevolucionRepo } from "../repos/devolucion-repo.js";
import type { EmisorFiscal, ProveedorFiscal } from "./proveedor.js";
import { formatearNcf } from "../dominio/ecf.js";
import { ValidacionError } from "../repos/producto-repo.js";
import type { Devolucion, ComprobanteFiscal } from "../repos/tipos.js";
import { MSG } from "../dominio/mensajes.js";
import { now } from "../ids.js";
import { estadoDgiiDe, transmitirNcfConsumido, validarEmisor } from "./transmision.js";

export interface DevolucionConFiscalDeps {
  devolucionRepo: DevolucionRepo;
  facturaRepo: FacturaRepo;
  secuenciaRepo: SecuenciaNcfRepo;
  comprobanteRepo: ComprobanteFiscalRepo;
  anulacionRepo: NcfAnulacionRepo;
  proveedorFiscal: ProveedorFiscal;
}

export interface ResultadoDevolucionFiscal {
  devolucion: Devolucion;
  comprobante: ComprobanteFiscal;
}

const CODIGO_ANULA_NCF = 1;
const CODIGO_CORRIGE_MONTOS = 3;

/**
 * Devuelve artículos de una venta que tiene comprobante fiscal (§6, §Ventas):
 * exige emitir primero una Nota de Crédito (E34) referenciando el NCF
 * original, con la misma política de "no contingencia" que el cobro fiscal
 * — si la DGII no acepta la NC, no se completa la devolución (nada se
 * restituye a inventario) y su número queda en cola para anular.
 */
export async function registrarDevolucionConFiscal(
  deps: DevolucionConFiscalDeps,
  input: DevolucionInput,
  emisorInput: EmisorFiscal | null,
): Promise<ResultadoDevolucionFiscal> {
  const { devolucionRepo, facturaRepo, secuenciaRepo, comprobanteRepo } = deps;
  const emisor = validarEmisor(emisorInput);

  const factura = await facturaRepo.obtener(input.facturaId);
  if (!factura) throw new Error(MSG.facturaNoExiste);
  if (!factura.comprobante_id) {
    throw new ValidacionError([
      { campo: "factura", mensaje: "Esta venta no tiene comprobante fiscal; use la devolución sin Nota de Crédito." },
    ]);
  }
  const comprobanteOriginal = await comprobanteRepo.obtener(factura.comprobante_id);
  if (!comprobanteOriginal) throw new Error(MSG.comprobanteNoExiste);

  // Valida todo y calcula montos SIN escribir nada (mismo orden que cobrarConFiscal:
  // no se consume el NCF de la NC hasta que la devolución en sí es válida).
  const preparada = await devolucionRepo.prepararDevolucion(input);

  const secuencia = await secuenciaRepo.obtenerVigente("34");
  if (!secuencia) {
    throw new ValidacionError([
      {
        campo: "secuencia",
        mensaje:
          "No hay una secuencia de NCF vigente para Nota de Crédito (E34). Configúrela antes de procesar devoluciones de ventas fiscales.",
      },
    ]);
  }

  const numero = await secuenciaRepo.consumirSiguiente(secuencia.id);
  const ncf = formatearNcf("34", numero);
  const esDevolucionTotal = Math.abs(preparada.total - comprobanteOriginal.total) < 0.005;

  const resultadoTransmision = await transmitirNcfConsumido(
    deps,
    {
      ncf,
      tipoEcf: "34",
      emisor,
      fechaEmision: now(),
      fechaVencimientoSecuencia: null,
      receptorDocumentoTipo: comprobanteOriginal.receptor_documento_tipo,
      receptorDocumentoNumero: comprobanteOriginal.receptor_documento_numero,
      receptorNombre: null,
      lineas: preparada.lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        tasaImpuesto: l.tasaImpuesto,
        subtotal: l.subtotal,
      })),
      pagos: [],
      montoGravado: preparada.subtotalGravado,
      montoExento: preparada.subtotalExento,
      montoItbis: preparada.totalItbis,
      total: preparada.total,
      referencia: {
        ncfModificado: comprobanteOriginal.ncf,
        fechaNcfModificado: comprobanteOriginal.fecha_emision,
        codigoModificacion: esDevolucionTotal ? CODIGO_ANULA_NCF : CODIGO_CORRIGE_MONTOS,
        razon: input.motivo?.trim() || null,
      },
    },
    "la Nota de Crédito",
  );

  const devolucion = await devolucionRepo.crear(input);

  const comprobante = await comprobanteRepo.crear({
    facturaId: input.facturaId,
    tipoEcf: "34",
    ncf,
    secuenciaId: secuencia.id,
    rncEmisor: emisor.rnc,
    receptorDocumentoTipo: comprobanteOriginal.receptor_documento_tipo,
    receptorDocumentoNumero: comprobanteOriginal.receptor_documento_numero,
    montoGravado: preparada.subtotalGravado,
    montoExento: preparada.subtotalExento,
    montoItbis: preparada.totalItbis,
    total: preparada.total,
    estadoDgii: estadoDgiiDe(resultadoTransmision.estado),
    trackIdDgii: resultadoTransmision.trackId ?? null,
    codigoSeguridad: resultadoTransmision.codigoSeguridad ?? null,
    qrUrl: resultadoTransmision.qrUrl ?? null,
    fechaFirma: resultadoTransmision.fechaFirma ?? null,
    xmlFirmado: resultadoTransmision.xmlFirmado ?? null,
  });

  await devolucionRepo.marcarComprobante(devolucion.id, comprobante.id);

  return { devolucion: (await devolucionRepo.obtener(devolucion.id))!, comprobante };
}
