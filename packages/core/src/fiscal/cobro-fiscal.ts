import type { FacturaRepo } from "../repos/factura-repo.js";
import type { SecuenciaNcfRepo } from "../repos/secuencia-ncf-repo.js";
import type { ComprobanteFiscalRepo } from "../repos/comprobante-fiscal-repo.js";
import type { NcfAnulacionRepo } from "../repos/ncf-anulacion-repo.js";
import type { EmisorFiscal, PagoATransmitir, ProveedorFiscal } from "./proveedor.js";
import { redondear2 } from "../dominio/dinero.js";
import { procesarCobro, type PagoInput } from "../dominio/factura.js";
import { ETIQUETA_TIPO_ECF, formatearNcf, requiereCompradorIdentificado, type TipoEcf } from "../dominio/ecf.js";
import { esDocumentoValido } from "../dominio/validacion.js";
import { ValidacionError } from "../repos/producto-repo.js";
import type { Factura, ComprobanteFiscal } from "../repos/tipos.js";
import { MSG } from "../dominio/mensajes.js";
import { now } from "../ids.js";
import { estadoDgiiDe, transmitirNcfConsumido, UMBRAL_CONSUMO_CON_COMPRADOR, validarEmisor } from "./transmision.js";

/** Lo que realmente se aplicó a la factura: el cambio sale del efectivo entregado. */
function pagosAplicados(pagos: PagoInput[], cambio: number): PagoATransmitir[] {
  let porDescontar = cambio;
  const aplicados = [...pagos].reverse().map((p) => {
    if (p.metodo !== "efectivo" || porDescontar <= 0) return { metodo: p.metodo, monto: p.monto };
    const descuento = Math.min(p.monto, porDescontar);
    porDescontar = redondear2(porDescontar - descuento);
    return { metodo: p.metodo, monto: redondear2(p.monto - descuento) };
  });
  return aplicados.reverse().filter((p) => p.monto > 0);
}

export interface CobrarConFiscalInput {
  pagos: PagoInput[];
  notas?: string | null;
  tipoEcf: TipoEcf;
  receptorDocumentoTipo?: "rnc" | "cedula" | null;
  receptorDocumentoNumero?: string | null;
  receptorNombre?: string | null;
  /** Datos del negocio emisor (de Configuración). */
  emisor: EmisorFiscal | null;
}

export interface CobrarConFiscalDeps {
  facturaRepo: FacturaRepo;
  secuenciaRepo: SecuenciaNcfRepo;
  comprobanteRepo: ComprobanteFiscalRepo;
  anulacionRepo: NcfAnulacionRepo;
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
 * secundarios (líneas, monto suficiente, secuencia vigente, datos del emisor y
 * del receptor) — recién después se **consume** el número de NCF y se llama al
 * proveedor fiscal. Así una venta que iba a fallar por dinero insuficiente
 * nunca desperdicia un NCF. Si aun así el número se pierde (sin conexión o
 * rechazo), queda en cola para anularlo ante la DGII.
 *
 * Política de contingencia (decisión del usuario, ver plan.md): si no hay
 * conexión/aceptación de la DGII, **no se permite la venta fiscal** — nada se
 * cobra. El cajero puede reintentar o cobrar sin comprobante fiscal. Un e-CF
 * "en proceso" sí cobra: la DGII ya lo recibió y se reconcilia después.
 */
export async function cobrarConFiscal(
  deps: CobrarConFiscalDeps,
  facturaId: string,
  input: CobrarConFiscalInput,
): Promise<ResultadoCobroFiscal> {
  const { facturaRepo, secuenciaRepo, comprobanteRepo } = deps;

  const emisor = validarEmisor(input.emisor);
  const receptorNombre = input.receptorNombre?.trim() || null;

  if (requiereCompradorIdentificado(input.tipoEcf)) {
    const etiqueta = ETIQUETA_TIPO_ECF[input.tipoEcf];
    if (!input.receptorDocumentoNumero) {
      throw new ValidacionError([
        { campo: "receptorDocumentoNumero", mensaje: `El ${etiqueta} requiere el RNC del comprador.` },
      ]);
    }
    if (!receptorNombre) {
      throw new ValidacionError([
        { campo: "receptorNombre", mensaje: `El ${etiqueta} requiere la razón social del comprador.` },
      ]);
    }
  }
  if (input.receptorDocumentoNumero && !esDocumentoValido(input.receptorDocumentoTipo, input.receptorDocumentoNumero)) {
    const etiqueta = input.receptorDocumentoTipo === "cedula" ? "cédula" : "RNC";
    throw new ValidacionError([
      { campo: "receptorDocumentoNumero", mensaje: `El ${etiqueta} del comprador no es válido.` },
    ]);
  }

  const factura = await facturaRepo.obtener(facturaId);
  if (!factura) throw new Error(MSG.ticketNoExiste);
  if (factura.estado !== "abierta") {
    throw new ValidacionError([{ campo: "estado", mensaje: "Este ticket ya fue cobrado o anulado." }]);
  }

  const lineas = await facturaRepo.obtenerLineas(facturaId);
  if (lineas.length === 0) {
    throw new ValidacionError([{ campo: "lineas", mensaje: "El ticket no tiene artículos." }]);
  }

  if (input.tipoEcf === "32" && factura.total >= UMBRAL_CONSUMO_CON_COMPRADOR && !input.receptorDocumentoNumero) {
    throw new ValidacionError([
      {
        campo: "receptorDocumentoNumero",
        mensaje: "Una factura de consumo de RD$250,000.00 o más requiere el RNC o la cédula del comprador.",
      },
    ]);
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

  const resultadoTransmision = await transmitirNcfConsumido(
    deps,
    {
      ncf,
      tipoEcf: input.tipoEcf,
      emisor,
      fechaEmision: now(),
      fechaVencimientoSecuencia: secuencia.vencimiento,
      receptorDocumentoTipo: input.receptorDocumentoTipo ?? null,
      receptorDocumentoNumero: input.receptorDocumentoNumero ?? null,
      receptorNombre,
      lineas: lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precioUnitario: l.precio_unitario,
        tasaImpuesto: l.tasa_impuesto,
        subtotal: l.subtotal,
      })),
      pagos: pagosAplicados(input.pagos, resultadoCobro.cambio),
      montoGravado: factura.subtotal_gravado,
      montoExento: factura.subtotal_exento,
      montoItbis: factura.total_itbis,
      total: factura.total,
      referencia: null,
    },
    "el comprobante",
  );

  const { factura: facturaCobrada, cambio } = await facturaRepo.cobrar(facturaId, {
    pagos: input.pagos,
    notas: input.notas,
  });

  const comprobante = await comprobanteRepo.crear({
    facturaId,
    tipoEcf: input.tipoEcf,
    ncf,
    secuenciaId: secuencia.id,
    rncEmisor: emisor.rnc,
    receptorDocumentoTipo: input.receptorDocumentoTipo ?? null,
    receptorDocumentoNumero: input.receptorDocumentoNumero ?? null,
    receptorNombre,
    montoGravado: facturaCobrada.subtotal_gravado,
    montoExento: facturaCobrada.subtotal_exento,
    montoItbis: facturaCobrada.total_itbis,
    total: facturaCobrada.total,
    estadoDgii: estadoDgiiDe(resultadoTransmision.estado),
    trackIdDgii: resultadoTransmision.trackId ?? null,
    codigoSeguridad: resultadoTransmision.codigoSeguridad ?? null,
    qrUrl: resultadoTransmision.qrUrl ?? null,
    fechaFirma: resultadoTransmision.fechaFirma ?? null,
    xmlFirmado: resultadoTransmision.xmlFirmado ?? null,
  });

  await facturaRepo.marcarFiscal(facturaId, comprobante.id);

  return { factura: (await facturaRepo.obtener(facturaId))!, cambio, comprobante };
}
