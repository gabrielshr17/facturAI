import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { calcularLinea, calcularTotales, type LineaInput } from "../dominio/factura.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { ImpuestoTipo } from "../dominio/impuesto.js";
import type { Devolucion, DevolucionLinea, FacturaLinea } from "./tipos.js";
import { MSG } from "../dominio/mensajes.js";

/**
 * Repo de devoluciones (§ Ventas): devolver artículos de una venta ya
 * cobrada. Si la factura original tiene comprobante fiscal, este repo NO
 * debe usarse directamente — usar `registrarDevolucionConFiscal`
 * (`fiscal/devolucion-fiscal.ts`), que exige emitir la Nota de Crédito (E34)
 * antes de completar la devolución. Este repo es la persistencia "plana"
 * que ambos caminos (con y sin fiscal) terminan usando.
 */

export interface LineaDevolucionInput {
  facturaLineaId: string;
  cantidad: number;
}

export interface DevolucionInput {
  facturaId: string;
  motivo?: string | null;
  lineas: LineaDevolucionInput[];
}

interface LineaPreparada {
  facturaLineaId: string;
  productoId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  impuestoTipo: ImpuestoTipo;
  tasaImpuesto: number;
  montoItbis: number;
  subtotal: number;
}

const COLS_FACTURA_LINEA = `id, factura_id, producto_id, descripcion, cantidad, precio_unitario,
  es_mayoreo, impuesto_tipo, tasa_impuesto, monto_itbis, subtotal, created_at, updated_at, deleted_at`;

const COLS_DEVOLUCION = `id, factura_id, fecha, motivo, subtotal, itbis, total, comprobante_id,
  created_at, updated_at, deleted_at`;

const COLS_LINEA = `id, devolucion_id, factura_linea_id, producto_id, descripcion, cantidad,
  precio_unitario, impuesto_tipo, tasa_impuesto, monto_itbis, subtotal, created_at, updated_at, deleted_at`;

/**
 * Valida la devolución (factura cobrada, líneas pertenecen a esa factura,
 * cantidad no excede lo disponible) y calcula subtotal/itbis/total — SIN
 * escribir nada. Se exporta para que el orquestador fiscal pueda conocer
 * los montos exactos antes de consumir el NCF de la Nota de Crédito.
 */
export async function prepararDevolucion(
  db: SqlDriver,
  input: DevolucionInput,
): Promise<{ lineas: LineaPreparada[]; subtotalGravado: number; subtotalExento: number; totalItbis: number; total: number }> {
  const factura = await db.get<{ estado: string }>(
    "SELECT estado FROM factura WHERE id=? AND deleted_at IS NULL",
    [input.facturaId],
  );
  if (!factura) throw new Error(MSG.facturaNoExiste);
  if (factura.estado !== "cobrada") {
    throw new ValidacionError([{ campo: "factura", mensaje: "Solo se pueden devolver artículos de ventas ya cobradas." }]);
  }
  if (input.lineas.length === 0) {
    throw new ValidacionError([{ campo: "lineas", mensaje: "Debe indicar al menos un artículo a devolver." }]);
  }

  const preparadas: LineaPreparada[] = [];
  for (const li of input.lineas) {
    if (!(li.cantidad > 0)) {
      throw new ValidacionError([{ campo: "cantidad", mensaje: "La cantidad a devolver debe ser mayor que cero." }]);
    }
    const linea = await db.get<FacturaLinea>(
      `SELECT ${COLS_FACTURA_LINEA} FROM factura_linea WHERE id=? AND factura_id=? AND deleted_at IS NULL`,
      [li.facturaLineaId, input.facturaId],
    );
    if (!linea) {
      throw new ValidacionError([{ campo: "lineas", mensaje: "Una de las líneas no pertenece a esta factura." }]);
    }
    const yaDevuelta = await db.get<{ total: number | null }>(
      "SELECT SUM(cantidad) as total FROM devolucion_linea WHERE factura_linea_id=? AND deleted_at IS NULL",
      [li.facturaLineaId],
    );
    const disponible = linea.cantidad - (yaDevuelta?.total ?? 0);
    if (li.cantidad > disponible) {
      throw new ValidacionError([
        { campo: "cantidad", mensaje: `Solo quedan ${disponible} unidad(es) de "${linea.descripcion}" disponibles para devolver.` },
      ]);
    }
    const calc = calcularLinea({ precioUnitario: linea.precio_unitario, cantidad: li.cantidad, tasaImpuesto: linea.tasa_impuesto });
    preparadas.push({
      facturaLineaId: li.facturaLineaId,
      productoId: linea.producto_id,
      descripcion: linea.descripcion,
      cantidad: li.cantidad,
      precioUnitario: linea.precio_unitario,
      impuestoTipo: linea.impuesto_tipo,
      tasaImpuesto: linea.tasa_impuesto,
      montoItbis: calc.montoItbis,
      subtotal: calc.subtotal,
    });
  }

  const totalesInput: LineaInput[] = preparadas.map((p) => ({
    precioUnitario: p.precioUnitario, cantidad: p.cantidad, tasaImpuesto: p.tasaImpuesto,
  }));
  const t = calcularTotales(totalesInput);
  return { lineas: preparadas, subtotalGravado: t.subtotalGravado, subtotalExento: t.subtotalExento, totalItbis: t.totalItbis, total: t.total };
}

export function crearDevolucionRepo(db: SqlDriver) {
  async function restituirInventario(devolucionId: string, lineas: LineaPreparada[], ts: string): Promise<void> {
    const negocio = await db.get<{ inventario_activo: number }>("SELECT inventario_activo FROM negocio LIMIT 1");
    if (negocio?.inventario_activo !== 1) return;

    for (const l of lineas) {
      if (!l.productoId) continue;
      const producto = await db.get<{ existencia: number | null }>("SELECT existencia FROM producto WHERE id=?", [l.productoId]);
      const nuevaExistencia = (producto?.existencia ?? 0) + l.cantidad;
      await db.run("UPDATE producto SET existencia=?, updated_at=? WHERE id=?", [nuevaExistencia, ts, l.productoId]);
      await db.run(
        `INSERT INTO movimiento_inventario
           (id, producto_id, tipo, cantidad, costo, referencia_tipo, referencia_id, fecha, usuario_id, created_at, updated_at, deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [newId(), l.productoId, "entrada", l.cantidad, null, "devolucion", devolucionId, ts, null, ts, ts, null],
      );
    }
  }

  return {
    /**
     * Valida y calcula montos SIN escribir nada — expuesto para que
     * `registrarDevolucionConFiscal` conozca los montos exactos antes de
     * consumir el NCF de la Nota de Crédito.
     */
    async prepararDevolucion(input: DevolucionInput) {
      return prepararDevolucion(db, input);
    },

    /**
     * Registra la devolución (sin comprobante fiscal). Para ventas con
     * comprobante fiscal, usar `registrarDevolucionConFiscal` en su lugar.
     */
    async crear(input: DevolucionInput): Promise<Devolucion> {
      const preparada = await prepararDevolucion(db, input);
      const ts = now();

      const d: Devolucion = {
        id: newId(),
        factura_id: input.facturaId,
        fecha: ts,
        motivo: input.motivo ?? null,
        subtotal: preparada.subtotalGravado + preparada.subtotalExento,
        itbis: preparada.totalItbis,
        total: preparada.total,
        comprobante_id: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
      await db.run(
        `INSERT INTO devolucion (${COLS_DEVOLUCION}) VALUES (${Array(11).fill("?").join(",")})`,
        [d.id, d.factura_id, d.fecha, d.motivo, d.subtotal, d.itbis, d.total, d.comprobante_id, d.created_at, d.updated_at, d.deleted_at],
      );

      for (const l of preparada.lineas) {
        const linea: DevolucionLinea = {
          id: newId(),
          devolucion_id: d.id,
          factura_linea_id: l.facturaLineaId,
          producto_id: l.productoId,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          impuesto_tipo: l.impuestoTipo,
          tasa_impuesto: l.tasaImpuesto,
          monto_itbis: l.montoItbis,
          subtotal: l.subtotal,
          created_at: ts,
          updated_at: ts,
          deleted_at: null,
        };
        await db.run(
          `INSERT INTO devolucion_linea (${COLS_LINEA}) VALUES (${Array(14).fill("?").join(",")})`,
          [
            linea.id, linea.devolucion_id, linea.factura_linea_id, linea.producto_id, linea.descripcion,
            linea.cantidad, linea.precio_unitario, linea.impuesto_tipo, linea.tasa_impuesto,
            linea.monto_itbis, linea.subtotal, linea.created_at, linea.updated_at, linea.deleted_at,
          ],
        );
      }

      await restituirInventario(d.id, preparada.lineas, ts);
      await registrarAccion(db, {
        accion: "registrar_devolucion", entidad: "devolucion", entidadId: d.id,
        resumen: `Total RD$ ${d.total.toFixed(2)} de la factura ${input.facturaId}`,
      });

      return d;
    },

    async marcarComprobante(id: string, comprobanteId: string): Promise<void> {
      await db.run("UPDATE devolucion SET comprobante_id=?, updated_at=? WHERE id=?", [comprobanteId, now(), id]);
    },

    async obtener(id: string): Promise<Devolucion | undefined> {
      return db.get<Devolucion>(`SELECT ${COLS_DEVOLUCION} FROM devolucion WHERE id=? AND deleted_at IS NULL`, [id]);
    },

    async obtenerLineas(devolucionId: string): Promise<DevolucionLinea[]> {
      return db.all<DevolucionLinea>(
        `SELECT ${COLS_LINEA} FROM devolucion_linea WHERE devolucion_id=? AND deleted_at IS NULL ORDER BY created_at`,
        [devolucionId],
      );
    },

    async listarPorFactura(facturaId: string): Promise<Devolucion[]> {
      return db.all<Devolucion>(
        `SELECT ${COLS_DEVOLUCION} FROM devolucion WHERE factura_id=? AND deleted_at IS NULL ORDER BY fecha DESC`,
        [facturaId],
      );
    },
  };
}

export type DevolucionRepo = ReturnType<typeof crearDevolucionRepo>;
