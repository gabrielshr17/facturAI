import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  type SqlDriver,
  type ProveedorFiscal,
  crearProductoRepo,
  crearClienteRepo,
  crearDepartamentoRepo,
  crearNegocioRepo,
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearNcfAnulacionRepo,
  crearProveedorFiscalSimulado,
  crearCorteCajaRepo,
  crearMovimientoInventarioRepo,
  crearProveedorRepo,
  crearCompraRepo,
  crearComprobanteArchivoRepo,
  crearBitacoraRepo,
  crearDevolucionRepo,
  crearReportesRepo,
  crearPromocionRepo,
  crearBackupRepo,
  crearCotizacionRepo,
  reconciliarComprobantesPendientes,
  anularNcfPendientes,
} from "@sfr/core";
import { useAuth } from "../contexto/Auth.js";
import { crearApiClient, type ApiClient } from "./apiClient.js";
import {
  MODO_FISCAL,
  anularRangosNcf,
  consultarEstadoComprobante,
  crearProveedorFiscalHttp,
  type ModoFiscal,
} from "./fiscalCliente.js";

const INTERVALO_SEGUIMIENTO_FISCAL_MS = 5 * 60 * 1000;

/** Conjunto de repos disponibles para las pantallas. */
export interface Repos {
  producto: ReturnType<typeof crearProductoRepo>;
  cliente: ReturnType<typeof crearClienteRepo>;
  departamento: ReturnType<typeof crearDepartamentoRepo>;
  negocio: ReturnType<typeof crearNegocioRepo>;
  factura: ReturnType<typeof crearFacturaRepo>;
  secuenciaNcf: ReturnType<typeof crearSecuenciaNcfRepo>;
  comprobanteFiscal: ReturnType<typeof crearComprobanteFiscalRepo>;
  ncfAnulacion: ReturnType<typeof crearNcfAnulacionRepo>;
  corteCaja: ReturnType<typeof crearCorteCajaRepo>;
  movimientoInventario: ReturnType<typeof crearMovimientoInventarioRepo>;
  proveedor: ReturnType<typeof crearProveedorRepo>;
  compra: ReturnType<typeof crearCompraRepo>;
  comprobanteArchivo: ReturnType<typeof crearComprobanteArchivoRepo>;
  bitacora: ReturnType<typeof crearBitacoraRepo>;
  devolucion: ReturnType<typeof crearDevolucionRepo>;
  reportes: ReturnType<typeof crearReportesRepo>;
  promocion: ReturnType<typeof crearPromocionRepo>;
  backup: ReturnType<typeof crearBackupRepo>;
  cotizacion: ReturnType<typeof crearCotizacionRepo>;
  /**
   * `VITE_FISCAL_MODO=dgii` transmite de verdad vía `@sfr/api` (firma con el
   * .p12 de la empresa). Cualquier otro valor usa el simulador, que NO envía
   * nada a la DGII.
   */
  proveedorFiscal: ProveedorFiscal;
  modoFiscal: ModoFiscal;
  api: ApiClient;
}

const ReposContext = createContext<Repos | null>(null);

/**
 * Consulta periódicamente a la DGII los comprobantes que quedaron "en proceso"
 * y anula los e-NCF consumidos que nunca llegaron a un comprobante válido.
 */
function useSeguimientoFiscal(repos: Repos, activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    let enCurso = false;

    async function ciclo() {
      if (enCurso) return;
      enCurso = true;
      try {
        const resumen = await reconciliarComprobantesPendientes({
          comprobanteRepo: repos.comprobanteFiscal,
          consultarEstado: (trackId) => consultarEstadoComprobante(repos.api, trackId),
        });
        if (resumen.rechazados.length > 0) {
          console.warn("La DGII rechazó comprobantes que estaban en proceso:", resumen.rechazados);
        }
        const negocio = await repos.negocio.obtener();
        if (negocio?.rnc) {
          const { utilizados } = await anularNcfPendientes({
            anulacionRepo: repos.ncfAnulacion,
            rncEmisor: negocio.rnc,
            anular: (rnc, rangos) => anularRangosNcf(repos.api, rnc, rangos),
          });
          if (utilizados.length > 0) {
            console.warn("La DGII reporta como utilizados e-NCF que no tienen venta local; revisar:", utilizados);
          }
        }
      } catch (error) {
        console.warn("Falló un ciclo de seguimiento fiscal; se reintentará en el próximo intervalo.", error);
      } finally {
        enCurso = false;
      }
    }

    void ciclo();
    const temporizador = setInterval(() => void ciclo(), INTERVALO_SEGUIMIENTO_FISCAL_MS);
    return () => clearInterval(temporizador);
  }, [repos, activo]);
}

/**
 * Provee los repos a partir de un `SqlDriver` ya migrado. Cada shell (PWA,
 * escritorio) crea su driver y lo pasa aquí; las pantallas son idénticas.
 */
export function ProveedorDatos({ db, children }: { db: SqlDriver; children: ReactNode }) {
  const { sesion } = useAuth();
  const accessToken = sesion?.accessToken ?? null;
  const api = useMemo(() => crearApiClient({ obtenerToken: () => accessToken }), [accessToken]);

  const repos = useMemo<Repos>(() => {
    return {
      producto: crearProductoRepo(db),
      cliente: crearClienteRepo(db),
      departamento: crearDepartamentoRepo(db),
      negocio: crearNegocioRepo(db),
      factura: crearFacturaRepo(db),
      secuenciaNcf: crearSecuenciaNcfRepo(db),
      comprobanteFiscal: crearComprobanteFiscalRepo(db),
      ncfAnulacion: crearNcfAnulacionRepo(db),
      corteCaja: crearCorteCajaRepo(db),
      movimientoInventario: crearMovimientoInventarioRepo(db),
      proveedor: crearProveedorRepo(db),
      compra: crearCompraRepo(db),
      comprobanteArchivo: crearComprobanteArchivoRepo(db),
      bitacora: crearBitacoraRepo(db),
      devolucion: crearDevolucionRepo(db),
      reportes: crearReportesRepo(db),
      promocion: crearPromocionRepo(db),
      backup: crearBackupRepo(db),
      cotizacion: crearCotizacionRepo(db),
      proveedorFiscal: MODO_FISCAL === "dgii" ? crearProveedorFiscalHttp(api) : crearProveedorFiscalSimulado(),
      modoFiscal: MODO_FISCAL,
      api,
    };
  }, [db, api]);

  useSeguimientoFiscal(repos, MODO_FISCAL === "dgii");

  return <ReposContext.Provider value={repos}>{children}</ReposContext.Provider>;
}

export function useRepos(): Repos {
  const r = useContext(ReposContext);
  if (!r) throw new Error("useRepos debe usarse dentro de <ProveedorDatos>");
  return r;
}
