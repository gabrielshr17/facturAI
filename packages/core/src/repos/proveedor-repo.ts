import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, normalizar, esCorreoValido, type ErrorValidacion } from "../dominio/validacion.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { Proveedor } from "./tipos.js";
import { MSG } from "../dominio/mensajes.js";

export interface ProveedorInput {
  nombre: string;
  rnc?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
}

export function validarProveedor(input: ProveedorInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.nombre)) {
    errores.push({ campo: "nombre", mensaje: "El nombre es obligatorio." });
  }
  if (tieneValor(input.correo) && !esCorreoValido(input.correo!)) {
    errores.push({ campo: "correo", mensaje: "El correo no tiene un formato válido." });
  }
  return errores;
}

const COLS = `id, nombre, rnc, telefono, correo, direccion, created_at, updated_at, deleted_at`;

export function crearProveedorRepo(db: SqlDriver) {
  return {
    async crear(input: ProveedorInput): Promise<Proveedor> {
      const errores = validarProveedor(input);
      if (errores.length) throw new ValidacionError(errores);

      const ts = now();
      const p: Proveedor = {
        id: newId(),
        nombre: input.nombre.trim(),
        rnc: input.rnc ?? null,
        telefono: input.telefono ?? null,
        correo: input.correo ?? null,
        direccion: input.direccion ?? null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO proveedor (${COLS}) VALUES (${Array(9).fill("?").join(",")})`, [
        p.id, p.nombre, p.rnc, p.telefono, p.correo, p.direccion, p.created_at, p.updated_at, p.deleted_at,
      ]);
      return p;
    },

    async actualizar(id: string, input: ProveedorInput): Promise<void> {
      const errores = validarProveedor(input);
      if (errores.length) throw new ValidacionError(errores);

      const actual = await this.obtener(id);
      if (!actual) throw new Error(MSG.proveedorNoExiste);

      await db.run(
        `UPDATE proveedor SET nombre=?, rnc=?, telefono=?, correo=?, direccion=?, updated_at=? WHERE id=?`,
        [
          input.nombre.trim(),
          input.rnc ?? actual.rnc,
          input.telefono ?? actual.telefono,
          input.correo ?? actual.correo,
          input.direccion ?? actual.direccion,
          now(), id,
        ],
      );
    },

    async eliminar(id: string): Promise<void> {
      const actual = await this.obtener(id);
      await db.run("UPDATE proveedor SET deleted_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
      await registrarAccion(db, {
        accion: "eliminar", entidad: "proveedor", entidadId: id,
        resumen: actual ? `Proveedor eliminado: ${actual.nombre}` : null,
      });
    },

    async obtener(id: string): Promise<Proveedor | undefined> {
      return db.get<Proveedor>(`SELECT ${COLS} FROM proveedor WHERE id=? AND deleted_at IS NULL`, [id]);
    },

    /** Lista/busca por nombre, ignorando acentos y mayúsculas. */
    async listar(q?: string): Promise<Proveedor[]> {
      const todos = await db.all<Proveedor>(
        `SELECT ${COLS} FROM proveedor WHERE deleted_at IS NULL ORDER BY nombre`,
      );
      if (!q || !q.trim()) return todos;
      const t = normalizar(q);
      return todos.filter((p) => normalizar(p.nombre).includes(t));
    },
  };
}

export type ProveedorRepo = ReturnType<typeof crearProveedorRepo>;
