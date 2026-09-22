import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { calcularLinea, calcularTotales, type LineaInput } from "../dominio/factura.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { ImpuestoTipo } from "../dominio/impuesto.js";
import type { Compra, CompraLinea } from "./tipos.js";

/**
 * Repo de compras (§ Compras e inventario). A diferencia de las ventas, una
 * compra se registra de una sola vez (no es un "ticket" que se arma de a
 * poco): se reciben todas las líneas junto con la cabecera y se guarda todo
 * en un solo `crear()`. Se registra SIEMPRE (inventario on u off) — es el
 * historial de costo y llegada; solo la existencia real se ajusta si el
 * inventario está activo.
 */

export interface LineaCompraInput {
  /** null = producto nuevo/no registrado en el catálogo todavía. */
  producto_id?: string | null;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  impuestoTipo: ImpuestoTipo;
  tasaImpuesto: number;
}

export interface CompraInput {
  /** Fecha ISO; por defecto ahora. */
  fecha?: string;
  proveedor_id?: string | null;
  ncf_proveedor?: string | null;
  tieneComprobanteFiscal?: boolean;
  notas?: string | null;
  lineas: LineaCompraInput[];
}

function validarLineaCompra(input: LineaCompraInput) {
  const errores: { campo: string; mensaje: string }[] = [];
  if (!input.descripcion?.trim()) {
    errores.push({ campo: "descripcion", mensaje: "La descripción del artículo es obligatoria." });
  }
  if (!(input.cantidad > 0)) {
    errores.push({ campo: "cantidad", mensaje: "La cantidad debe ser mayor que cero." });
  }
  if (input.costoUnitario < 0) {
    errores.push({ campo: "costoUnitario", mensaje: "El costo no puede ser negativo." });
  }
  return errores;
}

const COLS_COMPRA = `id, fecha, proveedor_id, subtotal, itbis, total, ncf_proveedor,
  tiene_comprobante_fiscal, mes_ano_contable, estado_clasificacion, origen, notas,
  created_at, updated_at, deleted_at`;

const COLS_LINEA = `id, compra_id, producto_id, descripcion, cantidad, costo_unitario,
  impuesto_tipo, tasa_impuesto, monto_itbis, subtotal, created_at, updated_at, deleted_at`;

export function crearCompraRepo(db: SqlDriver) {
  /** Actualiza el costo del producto (siempre) y la existencia (solo si inventario activo). */
  async function aplicarEfectosInventario(compraId: string, lineas: LineaCompraInput[], ts: string): Promise<void> {
    const negocio = await db.get<{ inventario_activo: number }>("SELECT inventario_activo FROM negocio LIMIT 1");
    const inventarioActivo = negocio?.inventario_activo === 1;

    for (const l of lineas) {
      if (!l.producto_id) continue;

      await db.run("UPDATE producto SET costo=?, updated_at=? WHERE id=?", [l.costoUnitario, ts, l.producto_id]);
      if (!inventarioActivo) continue;

      const producto = await db.get<{ existencia: number | null }>("SELECT existencia FROM producto WHERE id=?", [
        l.producto_id,
      ]);
      const nuevaExistencia = (producto?.existencia ?? 0) + l.cantidad;
      await db.run("UPDATE producto SET existencia=?, updated_at=? WHERE id=?", [nuevaExistencia, ts, l.producto_id]);
      await db.run(
        `INSERT INTO movimiento_inventario
           (id, producto_id, tipo, cantidad, costo, referencia_tipo, referencia_id, fecha, usuario_id, created_at, updated_at, deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [newId(), l.producto_id, "compra", l.cantidad, l.costoUnitario, "compra", compraId, ts, null, ts, ts, null],
      );
    }
  }

  const repo = {
    async crear(input: CompraInput): Promise<Compra> {
      if (input.lineas.length === 0) {
        throw new ValidacionError([{ campo: "lineas", mensaje: "La compra debe tener al menos un artículo." }]);
      }
      const errores = input.lineas.flatMap(validarLineaCompra);
      if (errores.length) throw new ValidacionError(errores);

      const ts = now();
      const fecha = input.fecha ?? ts;
      const mesAnoContable = fecha.slice(0, 7);

      const entrada: LineaInput[] = input.lineas.map((l) => ({
        precioUnitario: l.costoUnitario,
        cantidad: l.cantidad,
        tasaImpuesto: l.tasaImpuesto,
      }));
      const t = calcularTotales(entrada);
      const tieneComprobanteFiscal = input.tieneComprobanteFiscal ?? false;

      const c: Compra = {
        id: newId(),
        fecha,
        proveedor_id: input.proveedor_id ?? null,
        subtotal: t.subtotalGravado + t.subtotalExento,
        itbis: t.totalItbis,
        total: t.total,
        ncf_proveedor: input.ncf_proveedor ?? null,
        tiene_comprobante_fiscal: tieneComprobanteFiscal ? 1 : 0,
        mes_ano_contable: mesAnoContable,
        estado_clasificacion: tieneComprobanteFiscal ? "con_fiscal" : "sin_fiscal",
        origen: "manual",
        notas: input.notas ?? null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO compra (${COLS_COMPRA}) VALUES (${Array(15).fill("?").join(",")})`, [
        c.id,
        c.fecha,
        c.proveedor_id,
        c.subtotal,
        c.itbis,
        c.total,
        c.ncf_proveedor,
        c.tiene_comprobante_fiscal,
        c.mes_ano_contable,
        c.estado_clasificacion,
        c.origen,
        c.notas,
        c.created_at,
        c.updated_at,
        c.deleted_at,
      ]);

      for (const l of input.lineas) {
        const calc = calcularLinea({
          precioUnitario: l.costoUnitario,
          cantidad: l.cantidad,
          tasaImpuesto: l.tasaImpuesto,
        });
        const linea: CompraLinea = {
          id: newId(),
          compra_id: c.id,
          producto_id: l.producto_id ?? null,
          descripcion: l.descripcion.trim(),
          cantidad: l.cantidad,
          costo_unitario: l.costoUnitario,
          impuesto_tipo: l.impuestoTipo,
          tasa_impuesto: l.tasaImpuesto,
          monto_itbis: calc.montoItbis,
          subtotal: calc.subtotal,
          created_at: ts,
          updated_at: ts,
          deleted_at: null,
        };
        await db.run(`INSERT INTO compra_linea (${COLS_LINEA}) VALUES (${Array(13).fill("?").join(",")})`, [
          linea.id,
          linea.compra_id,
          linea.producto_id,
          linea.descripcion,
          linea.cantidad,
          linea.costo_unitario,
          linea.impuesto_tipo,
          linea.tasa_impuesto,
          linea.monto_itbis,
          linea.subtotal,
          linea.created_at,
          linea.updated_at,
          linea.deleted_at,
        ]);
      }

      await aplicarEfectosInventario(c.id, input.lineas, ts);
      await registrarAccion(db, {
        accion: "registrar_compra",
        entidad: "compra",
        entidadId: c.id,
        resumen: `Total RD$ ${c.total.toFixed(2)}`,
      });
      return c;
    },

    async obtener(id: string): Promise<Compra | undefined> {
      return db.get<Compra>(`SELECT ${COLS_COMPRA} FROM compra WHERE id=? AND deleted_at IS NULL`, [id]);
    },

    async obtenerLineas(compraId: string): Promise<CompraLinea[]> {
      return db.all<CompraLinea>(
        `SELECT ${COLS_LINEA} FROM compra_linea WHERE compra_id=? AND deleted_at IS NULL ORDER BY created_at`,
        [compraId],
      );
    },

    /** Lista de compras, filtrable por período y proveedor, más reciente primero. */
    async listar(
      filtro: { desde?: string | null; hasta?: string | null; proveedorId?: string | null } = {},
    ): Promise<Compra[]> {
      const condiciones = ["deleted_at IS NULL"];
      const params: unknown[] = [];
      if (filtro.desde) {
        condiciones.push("date(fecha) >= date(?)");
        params.push(filtro.desde);
      }
      if (filtro.hasta) {
        condiciones.push("date(fecha) <= date(?)");
        params.push(filtro.hasta);
      }
      if (filtro.proveedorId) {
        condiciones.push("proveedor_id = ?");
        params.push(filtro.proveedorId);
      }
      return db.all<Compra>(
        `SELECT ${COLS_COMPRA} FROM compra WHERE ${condiciones.join(" AND ")} ORDER BY fecha DESC`,
        params,
      );
    },
  };

  return repo;
}

export type CompraRepo = ReturnType<typeof crearCompraRepo>;
