import type { SqlDriver } from "../db/driver.js";

/**
 * Respaldo completo (§ Fase 3, importar/exportar): vuelca todas las tablas
 * tal cual están en SQLite, para exportar como archivo de respaldo/migración.
 * Nombres de tabla fijos (no vienen de fuera) — no hay riesgo de inyección
 * al interpolarlos en el SQL.
 */
const TABLAS = [
  "negocio", "usuario", "caja", "departamento", "producto", "cliente",
  "factura", "factura_linea", "pago",
  "secuencia_ncf", "comprobante_fiscal",
  "corte_caja", "movimiento_inventario",
  "proveedor", "compra", "compra_linea", "comprobante_archivo",
  "bitacora_accion",
  "devolucion", "devolucion_linea",
  "promocion",
] as const;

export interface RespaldoCompleto {
  version: number;
  generadoEn: string;
  tablas: Record<string, Record<string, unknown>[]>;
}

export function crearBackupRepo(db: SqlDriver) {
  return {
    async exportarTodo(): Promise<RespaldoCompleto> {
      const tablas: Record<string, Record<string, unknown>[]> = {};
      for (const tabla of TABLAS) {
        tablas[tabla] = await db.all(`SELECT * FROM ${tabla}`);
      }
      return { version: 1, generadoEn: new Date().toISOString(), tablas };
    },
  };
}

export type BackupRepo = ReturnType<typeof crearBackupRepo>;
