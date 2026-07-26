import type { FacturaRepo } from "../repos/factura-repo.js";
import type { SecuenciaNcfRepo } from "../repos/secuencia-ncf-repo.js";
import type { ComprobanteFiscalRepo } from "../repos/comprobante-fiscal-repo.js";
import type { ProveedorFiscal } from "./proveedor.js";
import { procesarCobro, type PagoInput } from "../dominio/factura.js";
import { formatearNcf, type TipoEcf } from "../dominio/ecf.js";
import { esDocumentoValido } from "../dominio/validacion.js";
import { ValidacionError } from "../repos/producto-repo.js";
import type { Factura, ComprobanteFiscal } from "../repos/tipos.js";

export interface CobrarConFiscalInput {
  pagos: PagoInput[];
  notas?: string | null;
  tipoEcf: TipoEcf;
  receptorDocumentoTipo?: "rnc" | "cedula" | null;
  receptorDocumentoNumero?: string | null;
  /** RNC del negocio emisor (de Configuración). */
  rncEmisor: string | null;
}

export interface CobrarConFiscalDeps {
  facturaRepo: FacturaRepo;
  secuenciaRepo: SecuenciaNcfRepo;
  comprobanteRepo: ComprobanteFiscalRepo;
  proveedorFiscal: ProveedorFiscal;
}

export interface ResultadoCobroFiscal {
  factura: Factura;
  cambio: number;
  comprobante: ComprobanteFiscal;
}

/**
 * Cobra un ticket EMITIENDO comprobante fiscal (§6).
 *
 * Orden importante: primero se valida todo lo que no tiene efectos
 * secundarios (líneas, monto suficiente, secuencia vigente, formato del
 * documento del receptor) — recién después se **consume** el número de NCF y
 * se llama al proveedor fiscal. Así una venta que iba a fallar por dinero
 * insuficiente nunca desperdicia un NCF.
 *
 * Política de contingencia (decisión del usuario, ver plan.md): si no hay
 * conexión/aceptación de la DGII, **no se permite la venta fiscal** — nada se
 * cobra. El cajero puede reintentar o cobrar sin comprobante fiscal.
 */
export async function cobrarConFiscal(
  deps: CobrarConFiscalDeps,
  facturaId: string,
  input: CobrarConFiscalInput,
): Promise<ResultadoCobroFiscal> {
  const { facturaRepo, secuenciaRepo, comprobanteRepo, proveedorFiscal } = deps;

  if (input.tipoEcf === "31" && !input.receptorDocumentoNumero) {
    throw new ValidacionError([
      { campo: "receptorDocumentoNumero", mensaje: "El Crédito Fiscal (E31) requiere el RNC del comprador." },
    ]);
  }
  if (input.receptorDocumentoNumero && !esDocumentoValido(input.receptorDocumentoTipo, input.receptorDocumentoNumero)) {
    const etiqueta = input.receptorDocumentoTipo === "cedula" ? "cédula" : "RNC";
    throw new ValidacionError([
      { campo: "receptorDocumentoNumero", mensaje: `El ${etiqueta} del comprador no es válido.` },
    ]);
  }

  const factura = await facturaRepo.obtener(facturaId);
  if (!factura) throw new Error(`Ticket ${facturaId} no existe`);
  if (factura.estado !== "abierta") {
    throw new ValidacionError([{ campo: "estado", mensaje: "Este ticket ya fue cobrado o anulado." }]);
  }

  const lineas = await facturaRepo.obtenerLineas(facturaId);
  if (lineas.length === 0) {
    throw new ValidacionError([{ campo: "lineas", mensaje: "El ticket no tiene artículos." }]);
  }

  const resultadoCobro = procesarCobro(factura.total, input.pagos);
  if (!resultadoCobro.suficiente) {
    throw new ValidacionError([
      { campo: "pagos", mensaje: `Falta por pagar RD$ ${resultadoCobro.faltante.toFixed(2)}.` },
    ]);
  }

  const secuencia = await secuenciaRepo.obtenerVigente(input.tipoEcf);
  if (!secuencia) {
    throw new ValidacionError([
      {
        campo: "secuencia",
        mensaje: "No hay una secuencia de NCF vigente para este tipo. Configúrela en Configuración antes de emitir.",
      },
    ]);
  }

  // A partir de aquí sí hay efectos secundarios: se consume el NCF y se transmite.
  const numero = await secuenciaRepo.consumirSiguiente(secuencia.id);
  const ncf = formatearNcf(input.tipoEcf, numero);

  let resultadoTransmision;
  try {
    resultadoTransmision = await proveedorFiscal.transmitir({
      ncf,
      tipoEcf: input.tipoEcf,
      rncEmisor: input.rncEmisor,
      receptorDocumentoTipo: input.receptorDocumentoTipo ?? null,
      receptorDocumentoNumero: input.receptorDocumentoNumero ?? null,
      montoGravado: factura.subtotal_gravado,
      montoExento: factura.subtotal_exento,
      montoItbis: factura.total_itbis,
      total: factura.total,
    });
  } catch {
    throw new ValidacionError([
      {
        campo: "fiscal",
        mensaje: "No se pudo transmitir el comprobante a la DGII (sin conexión). No se permite cobrar con NCF sin conexión; puede cobrar sin comprobante fiscal.",
      },
    ]);
  }

  if (resultadoTransmision.estado !== "aceptado") {
    throw new ValidacionError([
      { campo: "fiscal", mensaje: `La DGII rechazó el comprobante: ${resultadoTransmision.motivoRechazo ?? "sin detalle"}.` },
    ]);
  }

  const { factura: facturaCobrada, cambio } = await facturaRepo.cobrar(facturaId, {
    pagos: input.pagos,
    notas: input.notas,
  });

  const comprobante = await comprobanteRepo.crear({
    facturaId,
    tipoEcf: input.tipoEcf,
    ncf,
    secuenciaId: secuencia.id,
    rncEmisor: input.rncEmisor,
    receptorDocumentoTipo: input.receptorDocumentoTipo ?? null,
    receptorDocumentoNumero: input.receptorDocumentoNumero ?? null,
    montoGravado: facturaCobrada.subtotal_gravado,
    montoExento: facturaCobrada.subtotal_exento,
    montoItbis: facturaCobrada.total_itbis,
    total: facturaCobrada.total,
    estadoDgii: "aceptado",
    trackIdDgii: resultadoTransmision.trackId ?? null,
    codigoSeguridad: resultadoTransmision.codigoSeguridad ?? null,
  });

  await facturaRepo.marcarFiscal(facturaId, comprobante.id);

  return { factura: (await facturaRepo.obtener(facturaId))!, cambio, comprobante };
}
