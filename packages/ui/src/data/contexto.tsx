import { createContext, useContext, type ReactNode } from "react";
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
} from "@sfr/core";

/** Conjunto de repos disponibles para las pantallas. */
export interface Repos {
  producto: ReturnType<typeof crearProductoRepo>;
  cliente: ReturnType<typeof crearClienteRepo>;
  departamento: ReturnType<typeof crearDepartamentoRepo>;
  negocio: ReturnType<typeof crearNegocioRepo>;
  factura: ReturnType<typeof crearFacturaRepo>;
  secuenciaNcf: ReturnType<typeof crearSecuenciaNcfRepo>;
  comprobanteFiscal: ReturnType<typeof crearComprobanteFiscalRepo>;
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
   * *** SIMULADO — no transmite nada real a la DGII. *** Placeholder hasta
   * decidir PAC vs integración directa (ver plan.md). Sustituir aquí por la
   * implementación real cuando esté disponible.
   */
  proveedorFiscal: ProveedorFiscal;
}

const ReposContext = createContext<Repos | null>(null);

/**
 * Provee los repos a partir de un `SqlDriver` ya migrado. Cada shell (PWA,
 * escritorio) crea su driver y lo pasa aquí; las pantallas son idénticas.
 */
export function ProveedorDatos({ db, children }: { db: SqlDriver; children: ReactNode }) {
  const repos: Repos = {
    producto: crearProductoRepo(db),
    cliente: crearClienteRepo(db),
    departamento: crearDepartamentoRepo(db),
    negocio: crearNegocioRepo(db),
    factura: crearFacturaRepo(db),
    secuenciaNcf: crearSecuenciaNcfRepo(db),
    comprobanteFiscal: crearComprobanteFiscalRepo(db),
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
    proveedorFiscal: crearProveedorFiscalSimulado(),
  };
  return <ReposContext.Provider value={repos}>{children}</ReposContext.Provider>;
}

export function useRepos(): Repos {
  const r = useContext(ReposContext);
  if (!r) throw new Error("useRepos debe usarse dentro de <ProveedorDatos>");
  return r;
}
