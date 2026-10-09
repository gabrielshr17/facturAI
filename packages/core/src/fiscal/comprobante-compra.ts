import type { CompraRepo } from "../repos/compra-repo.js";
import type { ProveedorRepo } from "../repos/proveedor-repo.js";
import type { SecuenciaNcfRepo } from "../repos/secuencia-ncf-repo.js";
import type { ComprobanteFiscalRepo } from "../repos/comprobante-fiscal-repo.js";
import type { NcfAnulacionRepo } from "../repos/ncf-anulacion-repo.js";
import type { EmisorFiscal, LineaATransmitir, ProveedorFiscal } from "./proveedor.js";
import { redondear2 } from "../dominio/dinero.js";
import { ETIQUETA_TIPO_ECF, formatearNcf } from "../dominio/ecf.js";
import { ValidacionError } from "../repos/producto-repo.js";
import type { Compra, CompraLinea, ComprobanteFiscal, Proveedor } from "../repos/tipos.js";
import { MSG } from "../dominio/mensajes.js";
import { now } from "../ids.js";
import { estadoDgiiDe, transmitirNcfConsumido, validarEmisor } from "./transmision.js";

export type TipoEcfDeCompra = "41" | "43" | "47";

export interface RetencionLineaInput {
  esServicio?: boolean;
  itbisRetenido?: number;
  isrRetenido?: number;
}

export interface ComprobanteDeCompraInput {
  compraId: string;
  tipoEcf: TipoEcfDeCompra;
  /** Retenciones digitadas por el usuario, por id de línea de la compra. */
  retenciones: Record<string, RetencionLineaInput>;
}

export interface ComprobanteDeCompraDeps {
  compraRepo: Pick<CompraRepo, "obtener" | "obtenerLineas" | "marcarComprobanteEmitido">;
  proveedorRepo: Pick<ProveedorRepo, "obtener">;
  secuenciaRepo: SecuenciaNcfRepo;
  comprobanteRepo: ComprobanteFiscalRepo;
  anulacionRepo: NcfAnulacionRepo;
  proveedorFiscal: ProveedorFiscal;
}

export interface ResultadoComprobanteDeCompra {
  comprobante: ComprobanteFiscal;
}

const SOLO_EXENTOS: ReadonlySet<TipoEcfDeCompra> = new Set(["43", "47"]);

function error(campo: string, mensaje: string): ValidacionError {
  return new ValidacionError([{ campo, mensaje }]);
}

interface Receptor {
  numero: string | null;
  nombre: string | null;
  tipo: "rnc" | "cedula" | null;
}

function receptorDe(tipoEcf: TipoEcfDeCompra, proveedor: Proveedor | undefined): Receptor {
  if (tipoEcf === "43") return { numero: null, nombre: null, tipo: null };
  if (tipoEcf === "47") {
    if (!proveedor) throw error("proveedor", "El E47 requiere el proveedor del exterior en la compra.");
    return { numero: proveedor.rnc?.trim() || null, nombre: proveedor.nombre.trim(), tipo: null };
  }
  const digitos = proveedor?.rnc?.replace(/\D/g, "") ?? "";
  if (!proveedor?.nombre.trim() || (digitos.length !== 9 && digitos.length !== 11)) {
    throw error(
      "proveedor",
      "El E41 requiere un proveedor con razón social y un RNC (9 dígitos) o cédula (11 dígitos) válidos.",
    );
  }
  return { numero: digitos, nombre: proveedor.nombre.trim(), tipo: digitos.length === 9 ? "rnc" : "cedula" };
}

function validarRetencionDeLinea(
  tipoEcf: TipoEcfDeCompra,
  linea: CompraLinea,
  retencion: RetencionLineaInput | undefined,
): void {
  const { itbisRetenido, isrRetenido, esServicio } = retencion ?? {};
  const etiqueta = `"${linea.descripcion}"`;
  if ((itbisRetenido ?? 0) < 0 || (isrRetenido ?? 0) < 0) {
    throw error("retenciones", `La retención de ${etiqueta} no puede ser negativa.`);
  }
  if (tipoEcf === "47") {
    if (isrRetenido === undefined) {
      throw error("retenciones", `El E47 requiere el ISR retenido de ${etiqueta} (puede ser cero).`);
    }
    if (itbisRetenido !== undefined) {
      throw error("retenciones", "El E47 no lleva ITBIS retenido.");
    }
  }
  if (tipoEcf === "43" && (itbisRetenido !== undefined || isrRetenido !== undefined)) {
    throw error("retenciones", "El E43 no admite retenciones.");
  }
  if ((itbisRetenido ?? 0) > linea.monto_itbis) {
    throw error("retenciones", `El ITBIS retenido de ${etiqueta} no puede exceder su ITBIS (${linea.monto_itbis}).`);
  }
  if ((isrRetenido ?? 0) > linea.subtotal) {
    throw error("retenciones", `El ISR retenido de ${etiqueta} no puede exceder su monto (${linea.subtotal}).`);
  }
  if ((isrRetenido ?? 0) > 0 && !esServicio) {
    throw error("retenciones", `Solo se puede retener ISR en un servicio; ${etiqueta} no está marcado como servicio.`);
  }
}

async function validarCompra(
  deps: ComprobanteDeCompraDeps,
  compra: Compra | undefined,
  lineas: CompraLinea[],
  input: ComprobanteDeCompraInput,
): Promise<Compra> {
  if (!compra) throw new Error(MSG.compraNoExiste);
  if (compra.tiene_comprobante_fiscal || (await deps.comprobanteRepo.obtenerPorCompra(compra.id))) {
    throw error("compra", "Esta compra ya tiene un comprobante fiscal; no se puede emitir otro.");
  }
  if (compra.ncf_proveedor) {
    throw error("compra", "Esta compra ya tiene el NCF del proveedor; no necesita un comprobante propio.");
  }
  if (lineas.length === 0) throw error("lineas", "La compra no tiene artículos.");
  if (SOLO_EXENTOS.has(input.tipoEcf) && lineas.some((l) => l.tasa_impuesto !== 0)) {
    throw error("lineas", `El ${ETIQUETA_TIPO_ECF[input.tipoEcf]} solo admite artículos exentos de ITBIS.`);
  }
  for (const linea of lineas) validarRetencionDeLinea(input.tipoEcf, linea, input.retenciones[linea.id]);
  return compra;
}

function lineaATransmitir(linea: CompraLinea, retencion: RetencionLineaInput | undefined): LineaATransmitir {
  const transmitida: LineaATransmitir = {
    descripcion: linea.descripcion,
    cantidad: linea.cantidad,
    precioUnitario: linea.costo_unitario,
    tasaImpuesto: linea.tasa_impuesto,
    subtotal: linea.subtotal,
  };
  if (retencion?.esServicio) transmitida.esServicio = true;
  if (retencion?.itbisRetenido !== undefined) transmitida.itbisRetenido = retencion.itbisRetenido;
  if (retencion?.isrRetenido !== undefined) transmitida.isrRetenido = retencion.isrRetenido;
  return transmitida;
}

function montos(lineas: CompraLinea[]): { gravado: number; exento: number; itbis: number; total: number } {
  const suma = (filtro: (l: CompraLinea) => boolean, valor: (l: CompraLinea) => number) =>
    redondear2(lineas.filter(filtro).reduce((acc, l) => acc + valor(l), 0));
  return {
    gravado: suma(
      (l) => l.tasa_impuesto > 0,
      (l) => l.subtotal - l.monto_itbis,
    ),
    exento: suma(
      (l) => l.tasa_impuesto === 0,
      (l) => l.subtotal,
    ),
    itbis: suma(
      () => true,
      (l) => l.monto_itbis,
    ),
    total: suma(
      () => true,
      (l) => l.subtotal,
    ),
  };
}

export async function emitirComprobanteDeCompra(
  deps: ComprobanteDeCompraDeps,
  input: ComprobanteDeCompraInput,
  emisorInput: EmisorFiscal | null,
): Promise<ResultadoComprobanteDeCompra> {
  const { compraRepo, proveedorRepo, secuenciaRepo, comprobanteRepo } = deps;
  const emisor = validarEmisor(emisorInput);

  const lineas = await compraRepo.obtenerLineas(input.compraId);
  const compra = await validarCompra(deps, await compraRepo.obtener(input.compraId), lineas, input);
  const proveedor = compra.proveedor_id ? await proveedorRepo.obtener(compra.proveedor_id) : undefined;
  const receptor = receptorDe(input.tipoEcf, proveedor);

  const secuencia = await secuenciaRepo.obtenerVigente(input.tipoEcf);
  if (!secuencia) {
    throw error(
      "secuencia",
      `No hay una secuencia de NCF vigente para ${ETIQUETA_TIPO_ECF[input.tipoEcf]}. Configúrela antes de emitir.`,
    );
  }

  const { gravado, exento, itbis, total } = montos(lineas);

  const numero = await secuenciaRepo.consumirSiguiente(secuencia.id);
  const ncf = formatearNcf(input.tipoEcf, numero);

  const resultadoTransmision = await transmitirNcfConsumido(
    deps,
    {
      ncf,
      tipoEcf: input.tipoEcf,
      emisor,
      fechaEmision: now(),
      fechaVencimientoSecuencia: secuencia.vencimiento,
      receptorDocumentoTipo: receptor.tipo,
      receptorDocumentoNumero: receptor.numero,
      receptorNombre: receptor.nombre,
      lineas: lineas.map((l) => lineaATransmitir(l, input.retenciones[l.id])),
      pagos: input.tipoEcf === "41" ? [{ metodo: "efectivo", monto: total }] : [],
      montoGravado: gravado,
      montoExento: exento,
      montoItbis: itbis,
      total,
      referencia: null,
    },
    `el ${ETIQUETA_TIPO_ECF[input.tipoEcf]}`,
  );

  const comprobante = await comprobanteRepo.crear({
    compraId: compra.id,
    tipoEcf: input.tipoEcf,
    ncf,
    secuenciaId: secuencia.id,
    rncEmisor: emisor.rnc,
    receptorDocumentoTipo: receptor.tipo,
    receptorDocumentoNumero: receptor.numero,
    receptorNombre: receptor.nombre,
    montoGravado: gravado,
    montoExento: exento,
    montoItbis: itbis,
    total,
    estadoDgii: estadoDgiiDe(resultadoTransmision.estado),
    trackIdDgii: resultadoTransmision.trackId ?? null,
    codigoSeguridad: resultadoTransmision.codigoSeguridad ?? null,
    qrUrl: resultadoTransmision.qrUrl ?? null,
    fechaFirma: resultadoTransmision.fechaFirma ?? null,
    xmlFirmado: resultadoTransmision.xmlFirmado ?? null,
  });
  await compraRepo.marcarComprobanteEmitido(compra.id);

  return { comprobante };
}
