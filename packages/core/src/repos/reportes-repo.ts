import type { SqlDriver } from "../db/driver.js";
import { redondear2 } from "../dominio/dinero.js";

/**
 * Reportes (§ Fase 3, reportes avanzados): consultas de solo lectura sobre
 * ventas ya cobradas. Nota de alcance: son ventas BRUTAS del período — no
 * descuentan devoluciones. La ganancia es una ESTIMACIÓN usando el costo
 * ACTUAL del producto (no hay costo histórico por línea todavía), así que
 * si el costo cambió después de la venta, el número no es exacto.
 */

export interface VentaPorDia {
  fecha: string;
  totalVentas: number;
  cantidadFacturas: number;
}

export interface ProductoVendido {
  productoId: string | null;
  descripcion: string;
  cantidadVendida: number;
  totalVendido: number;
}

export interface ResumenGanancia {
  ingresos: number;
  costoEstimado: number;
  gananciaEstimada: number;
}

export interface ResumenItbis {
  totalGravado: number;
  totalExento: number;
  totalItbis: number;
}

export interface ResumenPorMetodo {
  metodo: string;
  total: number;
}

export function crearReportesRepo(db: SqlDriver) {
  return {
    async ventasPorDia(desde: string, hasta: string): Promise<VentaPorDia[]> {
      return db.all<VentaPorDia>(
        `SELECT date(fecha_hora) as fecha, SUM(total) as totalVentas, COUNT(*) as cantidadFacturas
         FROM factura
         WHERE estado='cobrada' AND deleted_at IS NULL
           AND date(fecha_hora) >= date(?) AND date(fecha_hora) <= date(?)
         GROUP BY date(fecha_hora)
         ORDER BY fecha`,
        [desde, hasta],
      );
    },

    async productosMasVendidos(desde: string, hasta: string, limite = 20): Promise<ProductoVendido[]> {
      return db.all<ProductoVendido>(
        `SELECT fl.producto_id as productoId, fl.descripcion as descripcion,
                SUM(fl.cantidad) as cantidadVendida, SUM(fl.subtotal) as totalVendido
         FROM factura_linea fl
         JOIN factura f ON f.id = fl.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)
         GROUP BY fl.producto_id, fl.descripcion
         ORDER BY cantidadVendida DESC
         LIMIT ?`,
        [desde, hasta, limite],
      );
    },

    async resumenGanancia(desde: string, hasta: string): Promise<ResumenGanancia> {
      const ingresos = await db.get<{ total: number | null }>(
        `SELECT SUM(fl.subtotal) as total
         FROM factura_linea fl JOIN factura f ON f.id = fl.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)`,
        [desde, hasta],
      );
      const costo = await db.get<{ total: number | null }>(
        `SELECT SUM(fl.cantidad * p.costo) as total
         FROM factura_linea fl
         JOIN factura f ON f.id = fl.factura_id
         JOIN producto p ON p.id = fl.producto_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)`,
        [desde, hasta],
      );
      const ing = ingresos?.total ?? 0;
      const cos = costo?.total ?? 0;
      return { ingresos: redondear2(ing), costoEstimado: redondear2(cos), gananciaEstimada: redondear2(ing - cos) };
    },

    async resumenItbis(desde: string, hasta: string): Promise<ResumenItbis> {
      const r = await db.get<{ gravado: number | null; exento: number | null; itbis: number | null }>(
        `SELECT SUM(subtotal_gravado) as gravado, SUM(subtotal_exento) as exento, SUM(total_itbis) as itbis
         FROM factura
         WHERE estado='cobrada' AND deleted_at IS NULL
           AND date(fecha_hora) >= date(?) AND date(fecha_hora) <= date(?)`,
        [desde, hasta],
      );
      return {
        totalGravado: redondear2(r?.gravado ?? 0),
        totalExento: redondear2(r?.exento ?? 0),
        totalItbis: redondear2(r?.itbis ?? 0),
      };
    },

    async ventasPorMetodoPago(desde: string, hasta: string): Promise<ResumenPorMetodo[]> {
      return db.all<ResumenPorMetodo>(
        `SELECT p.metodo as metodo, SUM(p.monto) as total
         FROM pago p JOIN factura f ON f.id = p.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND p.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)
         GROUP BY p.metodo
         ORDER BY total DESC`,
        [desde, hasta],
      );
    },
  };
}

export type ReportesRepo = ReturnType<typeof crearReportesRepo>;
