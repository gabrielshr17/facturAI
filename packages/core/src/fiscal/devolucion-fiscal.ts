import type { FacturaRepo } from "../repos/factura-repo.js";
import type { SecuenciaNcfRepo } from "../repos/secuencia-ncf-repo.js";
import type { ComprobanteFiscalRepo } from "../repos/comprobante-fiscal-repo.js";
import type { DevolucionInput, DevolucionRepo } from "../repos/devolucion-repo.js";
import type { ProveedorFiscal } from "./proveedor.js";
import { formatearNcf } from "../dominio/ecf.js";
import { ValidacionError } from "../repos/producto-repo.js";
import type { Devolucion, ComprobanteFiscal } from "../repos/tipos.js";

export interface DevolucionConFiscalDeps {
  devolucionRepo: DevolucionRepo;
  facturaRepo: FacturaRepo;
  secuenciaRepo: SecuenciaNcfRepo;
  comprobanteRepo: ComprobanteFiscalRepo;
  proveedorFiscal: ProveedorFiscal;
}

export interface ResultadoDevolucionFiscal {
  devolucion: Devolucion;
  comprobante: ComprobanteFiscal;
}

/**
 * Devuelve artículos de una venta que tiene comprobante fiscal (§6, §Ventas):
 * exige emitir primero una Nota de Crédito (E34) referenciando el NCF
 * original, con la misma política de "no contingencia" que el cobro fiscal
 * — si la DGII no acepta la NC, no se completa la devolución (nada se
 * restituye a inventario, ningún NCF de NC queda a medias).
 */
export async function registrarDevolucionConFiscal(
  deps: DevolucionConFiscalDeps,
  input: DevolucionInput,
  rncEmisor: string | null,
): Promise<ResultadoDevolucionFiscal> {
  const { devolucionRepo, facturaRepo, secuenciaRepo, comprobanteRepo, proveedorFiscal } = deps;

  const factura = await facturaRepo.obtener(input.facturaId);
  if (!factura) throw new Error(`Factura ${input.facturaId} no existe`);
  if (!factura.comprobante_id) {
    throw new ValidacionError([
      { campo: "factura", mensaje: "Esta venta no tiene comprobante fiscal; use la devolución sin Nota de Crédito." },
    ]);
  }
  const comprobanteOriginal = await comprobanteRepo.obtener(factura.comprobante_id);
  if (!comprobanteOriginal) throw new Error(`Comprobante ${factura.comprobante_id} no existe`);

  // Valida todo y calcula montos SIN escribir nada (mismo orden que cobrarConFiscal:
  // no se consume el NCF de la NC hasta que la devolución en sí es válida).
  const preparada = await devolucionRepo.prepararDevolucion(input);

  const secuencia = await secuenciaRepo.obtenerVigente("34");
  if (!secuencia) {
    throw new ValidacionError([
      {
        campo: "secuencia",
        mensaje: "No hay una secuencia de NCF vigente para Nota de Crédito (E34). Configúrela antes de procesar devoluciones de ventas fiscales.",
      },
    ]);
  }

  const numero = await secuenciaRepo.consumirSiguiente(secuencia.id);
  const ncf = formatearNcf("34", numero);

  let resultadoTransmision;
  try {
    resultadoTransmision = await proveedorFiscal.transmitir({
      ncf,
      tipoEcf: "34",
      rncEmisor,
      receptorDocumentoTipo: comprobanteOriginal.receptor_documento_tipo,
      receptorDocumentoNumero: comprobanteOriginal.receptor_documento_numero,
      montoGravado: preparada.subtotalGravado,
      montoExento: preparada.subtotalExento,
      montoItbis: preparada.totalItbis,
      total: preparada.total,
    });
  } catch {
    throw new ValidacionError([
      {
        campo: "fiscal",
        mensaje: "No se pudo transmitir la Nota de Crédito a la DGII (sin conexión). No se permite procesar la devolución fiscal sin conexión.",
      },
    ]);
  }

  if (resultadoTransmision.estado !== "aceptado") {
    throw new ValidacionError([
      { campo: "fiscal", mensaje: `La DGII rechazó la Nota de Crédito: ${resultadoTransmision.motivoRechazo ?? "sin detalle"}.` },
    ]);
  }

  const devolucion = await devolucionRepo.crear(input);

  const comprobante = await comprobanteRepo.crear({
    facturaId: input.facturaId,
    tipoEcf: "34",
    ncf,
    secuenciaId: secuencia.id,
    rncEmisor,
    receptorDocumentoTipo: comprobanteOriginal.receptor_documento_tipo,
    receptorDocumentoNumero: comprobanteOriginal.receptor_documento_numero,
    montoGravado: preparada.subtotalGravado,
    montoExento: preparada.subtotalExento,
    montoItbis: preparada.totalItbis,
    total: preparada.total,
    estadoDgii: "aceptado",
    trackIdDgii: resultadoTransmision.trackId ?? null,
    codigoSeguridad: resultadoTransmision.codigoSeguridad ?? null,
  });

  await devolucionRepo.marcarComprobante(devolucion.id, comprobante.id);

  return { devolucion: (await devolucionRepo.obtener(devolucion.id))!, comprobante };
}
