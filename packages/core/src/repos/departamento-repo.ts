import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor } from "../dominio/validacion.js";
import { ValidacionError } from "./producto-repo.js";
import type { Departamento } from "./tipos.js";

const COLS = `id, nombre, activo, created_at, updated_at, deleted_at`;

export function crearDepartamentoRepo(db: SqlDriver) {
  return {
    async crear(nombre: string): Promise<Departamento> {
      if (!tieneValor(nombre)) {
        throw new ValidacionError([{ campo: "nombre", mensaje: "El nombre es obligatorio." }]);
      }
      const ts = now();
      const d: Departamento = {
        id: newId(),
        nombre: nombre.trim(),
        activo: 1,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
      await db.run(`INSERT INTO departamento (${COLS}) VALUES (?,?,?,?,?,?)`, [
        d.id,
        d.nombre,
        d.activo,
        d.created_at,
        d.updated_at,
        d.deleted_at,
      ]);
      return d;
    },

    async renombrar(id: string, nombre: string): Promise<void> {
      if (!tieneValor(nombre)) {
        throw new ValidacionError([{ campo: "nombre", mensaje: "El nombre es obligatorio." }]);
      }
      await db.run("UPDATE departamento SET nombre=?, updated_at=? WHERE id=?", [nombre.trim(), now(), id]);
    },

    async eliminar(id: string): Promise<void> {
      await db.run("UPDATE departamento SET deleted_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
    },

    async listar(): Promise<Departamento[]> {
      return db.all<Departamento>(`SELECT ${COLS} FROM departamento WHERE deleted_at IS NULL ORDER BY nombre`);
    },
  };
}

export type DepartamentoRepo = ReturnType<typeof crearDepartamentoRepo>;
