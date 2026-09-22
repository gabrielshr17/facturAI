import type { SqlDriver } from "../db/driver.js";

/**
 * Respaldo completo (§ Fase 3, importar/exportar): vuelca todas las tablas
 * tal cual están en SQLite, para exportar como archivo de respaldo/migración.
 * Nombres de tabla fijos (no vienen de fuera) — no hay riesgo de inyección
 * al interpolarlos en el SQL.
 */
const TABLAS = [
  "negocio",
  "usuario",
  "caja",
  "departamento",
  "producto",
  "cliente",
  "factura",
  "factura_linea",
  "pago",
  "secuencia_ncf",
  "comprobante_fiscal",
  "corte_caja",
  "movimiento_inventario",
  "proveedor",
  "compra",
  "compra_linea",
  "comprobante_archivo",
  "bitacora_accion",
  "devolucion",
  "devolucion_linea",
  "promocion",
  "cotizacion",
  "cotizacion_linea",
] as const;

export interface RespaldoCompleto {
  version: number;
  generadoEn: string;
  tablas: Record<string, Record<string, unknown>[]>;
}

export interface ResultadoImportacion {
  filas: number;
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

    /**
     * Restaura un respaldo generado por `exportarTodo`. Las columnas de cada
     * fila se filtran contra `PRAGMA table_info` (columnas reales de esta
     * base, no las del archivo) antes de interpolarlas en el SQL — el archivo
     * es un JSON elegido por el usuario, no confiable, y así se evita que un
     * archivo manipulado inyecte nombres de columna arbitrarios.
     */
    async importarTodo(respaldo: RespaldoCompleto): Promise<ResultadoImportacion> {
      if (!respaldo || typeof respaldo.tablas !== "object") {
        throw new Error("El archivo no tiene el formato de un respaldo de facturAI.");
      }
      let filas = 0;
      for (const tabla of TABLAS) {
        const registros = respaldo.tablas[tabla];
        if (!registros || registros.length === 0) continue;
        const info = await db.all<{ name: string }>(`PRAGMA table_info(${tabla})`);
        const columnasValidas = new Set(info.map((c) => c.name));
        for (const fila of registros) {
          const columnas = Object.keys(fila).filter((c) => columnasValidas.has(c));
          if (columnas.length === 0) continue;
          const marcadores = columnas.map(() => "?").join(", ");
          const valores = columnas.map((c) => fila[c]);
          await db.run(`INSERT OR REPLACE INTO ${tabla} (${columnas.join(", ")}) VALUES (${marcadores})`, valores);
          filas++;
        }
      }
      return { filas };
    },
  };
}

export type BackupRepo = ReturnType<typeof crearBackupRepo>;
