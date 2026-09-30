import {
  anularNcfPendientes,
  entregarComprobantesAReceptores,
  reconciliarComprobantesPendientes,
  type crearComprobanteFiscalRepo,
  type crearNcfAnulacionRepo,
  type crearNegocioRepo,
} from "@sfr/core";
import type { ApiClient } from "./apiClient.js";
import {
  anularRangosNcf,
  consultarEstadoComprobante,
  consultarTrackIdsEcf,
  entregarAComprador,
} from "./fiscalCliente.js";

export interface DependenciasCicloFiscal {
  comprobanteFiscal: ReturnType<typeof crearComprobanteFiscalRepo>;
  ncfAnulacion: ReturnType<typeof crearNcfAnulacionRepo>;
  negocio: ReturnType<typeof crearNegocioRepo>;
  api: ApiClient;
}

export interface ResumenCicloFiscal {
  actualizados: number;
  rechazados: string[];
  entregados: number;
  entregasRechazadas: string[];
  anulados: number;
  utilizados: string[];
  errores: number;
}

let cicloEnCurso: Promise<ResumenCicloFiscal> | null = null;

async function ciclo(deps: DependenciasCicloFiscal): Promise<ResumenCicloFiscal> {
  const estados = await reconciliarComprobantesPendientes({
    comprobanteRepo: deps.comprobanteFiscal,
    consultarEstado: (trackId) => consultarEstadoComprobante(deps.api, trackId),
  });
  const entregas = await entregarComprobantesAReceptores({
    comprobanteRepo: deps.comprobanteFiscal,
    entregar: (datos) => entregarAComprador(deps.api, datos),
  });
  const negocio = await deps.negocio.obtener();
  const anulacion = negocio?.rnc
    ? await anularNcfPendientes({
        anulacionRepo: deps.ncfAnulacion,
        rncEmisor: negocio.rnc,
        anular: (rnc, rangos) => anularRangosNcf(deps.api, rnc, rangos),
        consultarTrackIds: (encf) => consultarTrackIdsEcf(deps.api, encf),
      })
    : { anulados: 0, utilizados: [] };
  return {
    actualizados: estados.actualizados,
    rechazados: estados.rechazados,
    entregados: entregas.entregados,
    entregasRechazadas: entregas.rechazados,
    anulados: anulacion.anulados,
    utilizados: anulacion.utilizados,
    errores: estados.errores + entregas.errores,
  };
}

/**
 * Un ciclo de seguimiento con la DGII: estados de los comprobantes en validación, entrega a
 * compradores electrónicos y anulación de e-NCF perdidos. Si ya hay uno corriendo (el temporizador
 * o el botón "Sincronizar ahora"), se reutiliza en vez de duplicar llamadas a la DGII.
 */
export function ejecutarCicloFiscal(deps: DependenciasCicloFiscal): Promise<ResumenCicloFiscal> {
  cicloEnCurso ??= ciclo(deps).finally(() => {
    cicloEnCurso = null;
  });
  return cicloEnCurso;
}
