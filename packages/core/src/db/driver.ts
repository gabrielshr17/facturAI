/**
 * Interfaz de driver SQL agnóstica del motor.
 *
 * El `core` no conoce el motor concreto: en escritorio será `tauri-plugin-sql`
 * (rusqlite), en la PWA `wa-sqlite`, y en Node (tests/seed/migraciones) el
 * módulo integrado `node:sqlite`. Todos implementan esta interfaz.
 *
 * Los métodos son asíncronos para acomodar drivers de navegador (WASM);
 * los drivers síncronos simplemente resuelven de inmediato.
 */
export interface SqlDriver {
  /** Ejecuta uno o varios statements (usado por migraciones). */
  exec(sql: string): Promise<void>;
  /** Ejecuta un statement con parámetros (INSERT/UPDATE/DELETE). */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Devuelve todas las filas de un SELECT. */
  all<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Devuelve la primera fila de un SELECT, o undefined. */
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  /** Cierra la conexión (opcional según el driver). */
  close?(): Promise<void>;
}
