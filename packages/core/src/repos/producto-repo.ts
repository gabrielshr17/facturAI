import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, normalizar, type ErrorValidacion } from "../dominio/validacion.js";
import { tasaDe } from "../dominio/impuesto.js";
import { calcularPrecioVenta } from "../dominio/precio.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { Producto } from "./tipos.js";

/** Datos para crear/editar un producto (sin campos de auditoría ni id). */
export interface ProductoInput {
  codigo_barra?: string | null;
  descripcion: string;
  tipo_venta?: Producto["tipo_venta"];
  unidad_medida?: string | null;
  costo?: number;
  pct_ganancia?: number;
  /** Precio manual; si se omite, se deriva de costo + %ganancia + impuesto. */
  precio_venta?: number | null;
  precio_mayoreo?: number | null;
  departamento_id?: string | null;
  impuesto_tipo?: Producto["impuesto_tipo"];
  politica_sin_existencia?: Producto["politica_sin_existencia"];
  activo?: boolean;
}

/** Valida un producto. Devuelve lista de errores (vacía si es válido). */
export function validarProducto(input: ProductoInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.descripcion)) {
    errores.push({ campo: "descripcion", mensaje: "La descripción es obligatoria." });
  }
  if (input.costo != null && input.costo < 0) {
    errores.push({ campo: "costo", mensaje: "El costo no puede ser negativo." });
  }
  if (input.precio_venta != null && input.precio_venta < 0) {
    errores.push({ campo: "precio_venta", mensaje: "El precio no puede ser negativo." });
  }
  return errores;
}

export class ValidacionError extends Error {
  constructor(public errores: ErrorValidacion[]) {
    super(errores.map((e) => e.mensaje).join(" "));
    this.name = "ValidacionError";
  }
}

const COLS = `id, codigo_barra, descripcion, tipo_venta, unidad_medida, costo,
  pct_ganancia, precio_venta, precio_mayoreo, departamento_id, impuesto_tipo,
  tasa_impuesto, existencia, politica_sin_existencia, activo, favorito,
  created_at, updated_at, deleted_at`;

export function crearProductoRepo(db: SqlDriver) {
  return {
    /** Crea un producto. Si no se da precio manual, lo deriva del costo. Lanza ValidacionError. */
    async crear(input: ProductoInput): Promise<Producto> {
      const errores = validarProducto(input);
      if (errores.length) throw new ValidacionError(errores);

      const impuesto_tipo = input.impuesto_tipo ?? "itbis18";
      const tasa = tasaDe(impuesto_tipo);
      const costo = input.costo ?? 0;
      const pct = input.pct_ganancia ?? 0;
      const precio = calcularPrecioVenta({
        costo,
        pctGanancia: pct,
        tasaImpuesto: tasa,
        precioManual: input.precio_venta ?? null,
      });

      const ts = now();
      const p: Producto = {
        id: newId(),
        codigo_barra: input.codigo_barra ?? null,
        descripcion: input.descripcion.trim(),
        tipo_venta: input.tipo_venta ?? "unidad",
        unidad_medida: input.unidad_medida ?? null,
        costo,
        pct_ganancia: pct,
        precio_venta: precio,
        precio_mayoreo: input.precio_mayoreo ?? null,
        departamento_id: input.departamento_id ?? null,
        impuesto_tipo,
        tasa_impuesto: tasa,
        existencia: null, // inventario off en el MVP
        politica_sin_existencia: input.politica_sin_existencia ?? "advertir",
        activo: input.activo === false ? 0 : 1,
        favorito: 0,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(
        `INSERT INTO producto (${COLS}) VALUES (${Array(19).fill("?").join(",")})`,
        [
          p.id, p.codigo_barra, p.descripcion, p.tipo_venta, p.unidad_medida, p.costo,
          p.pct_ganancia, p.precio_venta, p.precio_mayoreo, p.departamento_id, p.impuesto_tipo,
          p.tasa_impuesto, p.existencia, p.politica_sin_existencia, p.activo, p.favorito,
          p.created_at, p.updated_at, p.deleted_at,
        ],
      );
      return p;
    },

    /** Actualiza campos de un producto. Recalcula precio si cambia costo/%/impuesto y no hay precio manual. */
    async actualizar(id: string, input: ProductoInput): Promise<void> {
      const errores = validarProducto(input);
      if (errores.length) throw new ValidacionError(errores);

      const actual = await this.obtener(id);
      if (!actual) throw new Error(`Producto ${id} no existe`);

      const impuesto_tipo = input.impuesto_tipo ?? actual.impuesto_tipo;
      const tasa = tasaDe(impuesto_tipo);
      const costo = input.costo ?? actual.costo;
      const pct = input.pct_ganancia ?? actual.pct_ganancia;
      const precio = calcularPrecioVenta({
        costo,
        pctGanancia: pct,
        tasaImpuesto: tasa,
        precioManual: input.precio_venta ?? null,
      });

      await db.run(
        `UPDATE producto SET codigo_barra=?, descripcion=?, tipo_venta=?, unidad_medida=?,
           costo=?, pct_ganancia=?, precio_venta=?, precio_mayoreo=?, departamento_id=?,
           impuesto_tipo=?, tasa_impuesto=?, politica_sin_existencia=?, activo=?, updated_at=?
         WHERE id=?`,
        [
          input.codigo_barra ?? actual.codigo_barra,
          (input.descripcion ?? actual.descripcion).trim(),
          input.tipo_venta ?? actual.tipo_venta,
          input.unidad_medida ?? actual.unidad_medida,
          costo, pct, precio,
          input.precio_mayoreo ?? actual.precio_mayoreo,
          input.departamento_id ?? actual.departamento_id,
          impuesto_tipo, tasa,
          input.politica_sin_existencia ?? actual.politica_sin_existencia,
          input.activo === false ? 0 : 1,
          now(), id,
        ],
      );
    },

    /** Borrado lógico (deleted_at). */
    async eliminar(id: string): Promise<void> {
      const actual = await this.obtener(id);
      await db.run("UPDATE producto SET deleted_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
      await registrarAccion(db, {
        accion: "eliminar", entidad: "producto", entidadId: id,
        resumen: actual ? `Producto eliminado: ${actual.descripcion}` : null,
      });
    },

    /**
     * Corrige la existencia a un valor absoluto (conteo físico) y deja un
     * `movimiento_inventario` de tipo 'ajuste' con el delta aplicado.
     */
    async ajustarExistencia(id: string, nuevaExistencia: number): Promise<void> {
      if (!(nuevaExistencia >= 0)) {
        throw new ValidacionError([{ campo: "existencia", mensaje: "La existencia no puede ser negativa." }]);
      }
      const actual = await this.obtener(id);
      if (!actual) throw new Error(`Producto ${id} no existe`);

      const anterior = actual.existencia ?? 0;
      const delta = nuevaExistencia - anterior;
      const ts = now();

      await db.run("UPDATE producto SET existencia=?, updated_at=? WHERE id=?", [nuevaExistencia, ts, id]);

      if (delta !== 0) {
        await db.run(
          `INSERT INTO movimiento_inventario
             (id, producto_id, tipo, cantidad, costo, referencia_tipo, referencia_id, fecha, usuario_id, created_at, updated_at, deleted_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [newId(), id, "ajuste", delta, null, null, null, ts, null, ts, ts, null],
        );
        await registrarAccion(db, {
          accion: "ajustar_existencia", entidad: "producto", entidadId: id,
          resumen: `${actual.descripcion}: ${anterior} → ${nuevaExistencia} (${delta > 0 ? "+" : ""}${delta})`,
        });
      }
    },

    async obtener(id: string): Promise<Producto | undefined> {
      return db.get<Producto>(
        `SELECT ${COLS} FROM producto WHERE id=? AND deleted_at IS NULL`,
        [id],
      );
    },

    /** Busca por código de barra exacto (para el escaneo en Ventas). */
    async porCodigoBarra(codigo: string): Promise<Producto | undefined> {
      return db.get<Producto>(
        `SELECT ${COLS} FROM producto WHERE codigo_barra=? AND deleted_at IS NULL`,
        [codigo],
      );
    },

    /** Marca/desmarca un producto como favorito (§ Ventas: sube al tope de la búsqueda). */
    async alternarFavorito(id: string, favorito: boolean): Promise<void> {
      await db.run("UPDATE producto SET favorito=?, updated_at=? WHERE id=?", [favorito ? 1 : 0, now(), id]);
    },

    /**
     * Lista/busca productos. `q` filtra por descripción o código de barra,
     * ignorando acentos y mayúsculas (búsqueda parcial). El filtro se hace en JS
     * porque SQLite no quita diacríticos; a escala de MVP es suficiente.
     * Los favoritos siempre van primero (dentro de cada grupo, alfabético) —
     * así aparecen arriba tanto en el listado completo como en los resultados
     * de una búsqueda, sin tener que escribir la descripción completa.
     */
    async listar(q?: string): Promise<Producto[]> {
      const todos = await db.all<Producto>(
        `SELECT ${COLS} FROM producto WHERE deleted_at IS NULL ORDER BY favorito DESC, descripcion`,
      );
      if (!q || !q.trim()) return todos;
      // Por palabra, no por substring completo: "tropical carne" debe encontrar "carne de
      // hamburger tropical" aunque el orden no coincida — cada palabra escrita tiene que
      // aparecer en algún lugar de la descripción, no todas juntas y en ese orden exacto.
      const palabras = normalizar(q).split(/\s+/).filter(Boolean);
      return todos.filter((p) => {
        const descripcion = normalizar(p.descripcion);
        return (
          palabras.every((palabra) => descripcion.includes(palabra)) ||
          (p.codigo_barra ?? "").toLowerCase().includes(q.trim().toLowerCase())
        );
      });
    },
  };
}

export type ProductoRepo = ReturnType<typeof crearProductoRepo>;
