import type { ComprobanteFiscalRepo } from "../repos/comprobante-fiscal-repo.js";
import type { NcfAnulacionRepo } from "../repos/ncf-anulacion-repo.js";
import type { NcfAnulacion } from "../repos/tipos.js";
import type { TipoEcf } from "../dominio/ecf.js";
import type { EstadoTransmision } from "./proveedor.js";
import { estadoDgiiDe } from "./transmision.js";

export interface ReconciliarDeps {
  comprobanteRepo: ComprobanteFiscalRepo;
  consultarEstado: (trackId: string) => Promise<{ estado: EstadoTransmision; motivoRechazo?: string }>;
}

export interface ResumenReconciliacion {
  actualizados: number;
  rechazados: string[];
  errores: number;
}

/** Consulta a la DGII los comprobantes "pendiente" (E31/E32 grandes/E34 en proceso) y guarda su estado final. */
export async function reconciliarComprobantesPendientes(deps: ReconciliarDeps): Promise<ResumenReconciliacion> {
  const resumen: ResumenReconciliacion = { actualizados: 0, rechazados: [], errores: 0 };
  for (const comprobante of await deps.comprobanteRepo.listarPendientes()) {
    if (!comprobante.track_id_dgii) continue;
    try {
      const { estado, motivoRechazo } = await deps.consultarEstado(comprobante.track_id_dgii);
      if (estado === "en_proceso") continue;
      await deps.comprobanteRepo.actualizarEstado(comprobante.id, estadoDgiiDe(estado), motivoRechazo ?? null);
      resumen.actualizados += 1;
      if (estado === "rechazado") resumen.rechazados.push(comprobante.ncf);
    } catch {
      resumen.errores += 1;
    }
  }
  return resumen;
}

export interface RangoNcf {
  tipoEcf: TipoEcf;
  desde: string;
  hasta: string;
}

export interface AnularDeps {
  anulacionRepo: NcfAnulacionRepo;
  rncEmisor: string;
  anular: (rncEmisor: string, rangos: RangoNcf[]) => Promise<{ aceptada: boolean; mensajes: string[] }>;
}

function secuencial(ncf: string): number {
  return Number(ncf.slice(3));
}

export function agruparEnRangos(pendientes: Pick<NcfAnulacion, "tipo_ecf" | "ncf">[]): RangoNcf[] {
  const ordenados = [...pendientes].sort((a, b) =>
    a.tipo_ecf === b.tipo_ecf ? secuencial(a.ncf) - secuencial(b.ncf) : a.tipo_ecf.localeCompare(b.tipo_ecf),
  );
  const rangos: RangoNcf[] = [];
  for (const p of ordenados) {
    const ultimo = rangos.at(-1);
    if (ultimo && ultimo.tipoEcf === p.tipo_ecf && secuencial(p.ncf) === secuencial(ultimo.hasta) + 1) {
      ultimo.hasta = p.ncf;
    } else {
      rangos.push({ tipoEcf: p.tipo_ecf, desde: p.ncf, hasta: p.ncf });
    }
  }
  return rangos;
}

const MENSAJE_SECUENCIA_UTILIZADA = /utilizad/i;

function enRango(ncf: string, rango: RangoNcf): boolean {
  return (
    ncf.slice(1, 3) === rango.tipoEcf &&
    secuencial(ncf) >= secuencial(rango.desde) &&
    secuencial(ncf) <= secuencial(rango.hasta)
  );
}

/**
 * Anula ante la DGII (ANECF) los e-NCF consumidos que nunca llegaron a un
 * comprobante válido, un rango por solicitud: un rango rechazado no bloquea
 * a los demás. Si la DGII responde que el número sí se utilizó (p. ej. un
 * envío cuya respuesta se perdió), sale de la cola como `utilizado` para
 * revisarlo a mano: existe un e-CF en la DGII sin venta local.
 */
export async function anularNcfPendientes(deps: AnularDeps): Promise<{ anulados: number; utilizados: string[] }> {
  const pendientes = await deps.anulacionRepo.listarPendientes();
  const resultado = { anulados: 0, utilizados: [] as string[] };

  for (const rango of agruparEnRangos(pendientes)) {
    const delRango = pendientes.filter((p) => enRango(p.ncf, rango));
    const ids = delRango.map((p) => p.id);
    const respuesta = await deps.anular(deps.rncEmisor, [rango]);
    const mensaje = respuesta.mensajes.join("; ");

    if (respuesta.aceptada) {
      await deps.anulacionRepo.marcarAnulados(ids, mensaje || null);
      resultado.anulados += ids.length;
    } else if (MENSAJE_SECUENCIA_UTILIZADA.test(mensaje)) {
      await deps.anulacionRepo.marcarUtilizados(ids, mensaje);
      resultado.utilizados.push(...delRango.map((p) => p.ncf));
    } else {
      await deps.anulacionRepo.registrarIntentoFallido(ids, mensaje || "La DGII no aceptó la anulación.");
    }
  }
  return resultado;
}
