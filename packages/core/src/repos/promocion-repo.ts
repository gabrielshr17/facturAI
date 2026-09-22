import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, type ErrorValidacion } from "../dominio/validacion.js";
import type { TipoPromocion, AplicaAPromocion } from "../dominio/promocion.js";
import { ValidacionError } from "./producto-repo.js";
import type { Promocion } from "./tipos.js";

export interface PromocionInput {
  nombre: string;
  tipo: TipoPromocion;
  valor: number;
  aplicaA: AplicaAPromocion;
  productoId?: string | null;
  departamentoId?: string | null;
  fechaInicio: string; // 'AAAA-MM-DD'
  fechaFin: string; // 'AAAA-MM-DD'
  activa?: boolean;
}

function validar(input: PromocionInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.nombre)) {
    errores.push({ campo: "nombre", mensaje: "El nombre es obligatorio." });
  }
  if (!(input.valor > 0)) {
    errores.push({ campo: "valor", mensaje: "El valor del descuento debe ser mayor que cero." });
  }
  if (input.tipo === "porcentaje" && input.valor > 100) {
    errores.push({ campo: "valor", mensaje: "Un descuento porcentual no puede ser mayor que 100." });
  }
  if (input.aplicaA === "producto" && !input.productoId) {
    errores.push({ campo: "productoId", mensaje: "Selecciona el producto al que aplica." });
  }
  if (input.aplicaA === "departamento" && !input.departamentoId) {
    errores.push({ campo: "departamentoId", mensaje: "Selecciona el departamento al que aplica." });
  }
  if (input.fechaInicio > input.fechaFin) {
    errores.push({ campo: "vigencia", mensaje: "La fecha de inicio no puede ser posterior a la de fin." });
  }
  return errores;
}

const COLS = `id, nombre, tipo, valor, aplica_a, producto_id, departamento_id,
  fecha_inicio, fecha_fin, activa, created_at, updated_at, deleted_at`;

export function crearPromocionRepo(db: SqlDriver) {
  return {
    async crear(input: PromocionInput): Promise<Promocion> {
      const errores = validar(input);
      if (errores.length) throw new ValidacionError(errores);

      const ts = now();
      const p: Promocion = {
        id: newId(),
        nombre: input.nombre.trim(),
        tipo: input.tipo,
        valor: input.valor,
        aplica_a: input.aplicaA,
        producto_id: input.aplicaA === "producto" ? (input.productoId ?? null) : null,
        departamento_id: input.aplicaA === "departamento" ? (input.departamentoId ?? null) : null,
        fecha_inicio: input.fechaInicio,
        fecha_fin: input.fechaFin,
        activa: input.activa === false ? 0 : 1,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
      await db.run(`INSERT INTO promocion (${COLS}) VALUES (${Array(13).fill("?").join(",")})`, [
        p.id,
        p.nombre,
        p.tipo,
        p.valor,
        p.aplica_a,
        p.producto_id,
        p.departamento_id,
        p.fecha_inicio,
        p.fecha_fin,
        p.activa,
        p.created_at,
        p.updated_at,
        p.deleted_at,
      ]);
      return p;
    },

    async actualizar(id: string, input: PromocionInput): Promise<void> {
      const errores = validar(input);
      if (errores.length) throw new ValidacionError(errores);

      await db.run(
        `UPDATE promocion SET nombre=?, tipo=?, valor=?, aplica_a=?, producto_id=?, departamento_id=?,
           fecha_inicio=?, fecha_fin=?, activa=?, updated_at=?
         WHERE id=?`,
        [
          input.nombre.trim(),
          input.tipo,
          input.valor,
          input.aplicaA,
          input.aplicaA === "producto" ? (input.productoId ?? null) : null,
          input.aplicaA === "departamento" ? (input.departamentoId ?? null) : null,
          input.fechaInicio,
          input.fechaFin,
          input.activa === false ? 0 : 1,
          now(),
          id,
        ],
      );
    },

    async eliminar(id: string): Promise<void> {
      await db.run("UPDATE promocion SET deleted_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
    },

    async listar(): Promise<Promocion[]> {
      return db.all<Promocion>(`SELECT ${COLS} FROM promocion WHERE deleted_at IS NULL ORDER BY fecha_inicio DESC`);
    },

    /**
     * La mejor promoción aplicable (producto específico > departamento > todo)
     * vigente en `fecha` para ese producto/departamento, o undefined si ninguna.
     */
    async obtenerAplicable(
      productoId: string | null,
      departamentoId: string | null,
      fecha: string,
    ): Promise<Promocion | undefined> {
      const candidatas = await db.all<Promocion>(
        `SELECT ${COLS} FROM promocion
         WHERE activa=1 AND deleted_at IS NULL
           AND date(?) >= date(fecha_inicio) AND date(?) <= date(fecha_fin)
           AND (
             (aplica_a='producto' AND producto_id=?) OR
             (aplica_a='departamento' AND departamento_id=?) OR
             (aplica_a='todo')
           )
         ORDER BY CASE aplica_a WHEN 'producto' THEN 0 WHEN 'departamento' THEN 1 ELSE 2 END
         LIMIT 1`,
        [fecha, fecha, productoId, departamentoId],
      );
      return candidatas[0];
    },
  };
}

export type PromocionRepo = ReturnType<typeof crearPromocionRepo>;
