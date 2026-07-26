import type { SqlDriver } from "../db/driver.js";
import type { MovimientoInventario } from "./tipos.js";

const COLS = `id, producto_id, tipo, cantidad, costo, referencia_tipo, referencia_id,
  fecha, usuario_id, created_at, updated_at, deleted_at`;

export function crearMovimientoInventarioRepo(db: SqlDriver) {
  return {
    /** Historial de movimientos de un producto (§ Inventario), más reciente primero. */
    async listarPorProducto(productoId: string): Promise<MovimientoInventario[]> {
      return db.all<MovimientoInventario>(
        `SELECT ${COLS} FROM movimiento_inventario
         WHERE producto_id=? AND deleted_at IS NULL
         ORDER BY fecha DESC`,
        [productoId],
      );
    },
  };
}

export type MovimientoInventarioRepo = ReturnType<typeof crearMovimientoInventarioRepo>;
