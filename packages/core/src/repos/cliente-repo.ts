import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import {
  tieneValor,
  normalizar,
  esCorreoValido,
  esDocumentoValido,
  type ErrorValidacion,
} from "../dominio/validacion.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { Cliente } from "./tipos.js";
import { MSG } from "../dominio/mensajes.js";

export interface ClienteInput {
  nombre: string;
  apellidos?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  comentarios?: string | null;
  aplica_credito?: boolean;
  limite_credito?: number;
  documento_tipo?: "rnc" | "cedula" | null;
  documento_numero?: string | null;
}

/** Valida un cliente (§5: nombre obligatorio, correo y documento con formato). */
export function validarCliente(input: ClienteInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.nombre)) {
    errores.push({ campo: "nombre", mensaje: "El nombre es obligatorio." });
  }
  if (tieneValor(input.correo) && !esCorreoValido(input.correo!)) {
    errores.push({ campo: "correo", mensaje: "El correo no tiene un formato válido." });
  }
  if (!esDocumentoValido(input.documento_tipo, input.documento_numero)) {
    const et = input.documento_tipo === "rnc" ? "RNC" : "cédula";
    errores.push({ campo: "documento_numero", mensaje: `El ${et} no es válido.` });
  }
  return errores;
}

const COLS = `id, nombre, apellidos, telefono, correo, direccion, comentarios,
  aplica_credito, limite_credito, saldo_credito, documento_tipo, documento_numero,
  created_at, updated_at, deleted_at`;

export function crearClienteRepo(db: SqlDriver) {
  return {
    async crear(input: ClienteInput): Promise<Cliente> {
      const errores = validarCliente(input);
      if (errores.length) throw new ValidacionError(errores);

      const ts = now();
      const c: Cliente = {
        id: newId(),
        nombre: input.nombre.trim(),
        apellidos: input.apellidos ?? null,
        telefono: input.telefono ?? null,
        correo: input.correo ?? null,
        direccion: input.direccion ?? null,
        comentarios: input.comentarios ?? null,
        aplica_credito: input.aplica_credito ? 1 : 0,
        limite_credito: input.limite_credito ?? 0,
        saldo_credito: 0,
        documento_tipo: input.documento_tipo ?? null,
        documento_numero: input.documento_numero ?? null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO cliente (${COLS}) VALUES (${Array(15).fill("?").join(",")})`, [
        c.id,
        c.nombre,
        c.apellidos,
        c.telefono,
        c.correo,
        c.direccion,
        c.comentarios,
        c.aplica_credito,
        c.limite_credito,
        c.saldo_credito,
        c.documento_tipo,
        c.documento_numero,
        c.created_at,
        c.updated_at,
        c.deleted_at,
      ]);
      return c;
    },

    async actualizar(id: string, input: ClienteInput): Promise<void> {
      const errores = validarCliente(input);
      if (errores.length) throw new ValidacionError(errores);

      const actual = await this.obtener(id);
      if (!actual) throw new Error(MSG.clienteNoExiste);

      await db.run(
        `UPDATE cliente SET nombre=?, apellidos=?, telefono=?, correo=?, direccion=?,
           comentarios=?, aplica_credito=?, limite_credito=?, documento_tipo=?,
           documento_numero=?, updated_at=?
         WHERE id=?`,
        [
          input.nombre.trim(),
          input.apellidos ?? actual.apellidos,
          input.telefono ?? actual.telefono,
          input.correo ?? actual.correo,
          input.direccion ?? actual.direccion,
          input.comentarios ?? actual.comentarios,
          input.aplica_credito ? 1 : 0,
          input.limite_credito ?? actual.limite_credito,
          input.documento_tipo ?? actual.documento_tipo,
          input.documento_numero ?? actual.documento_numero,
          now(),
          id,
        ],
      );
    },

    async eliminar(id: string): Promise<void> {
      const actual = await this.obtener(id);
      await db.run("UPDATE cliente SET deleted_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
      await registrarAccion(db, {
        accion: "eliminar",
        entidad: "cliente",
        entidadId: id,
        resumen: actual ? `Cliente eliminado: ${actual.nombre} ${actual.apellidos ?? ""}`.trim() : null,
      });
    },

    async obtener(id: string): Promise<Cliente | undefined> {
      return db.get<Cliente>(`SELECT ${COLS} FROM cliente WHERE id=? AND deleted_at IS NULL`, [id]);
    },

    /**
     * Lista/busca por nombre, apellidos, teléfono o correo, ignorando acentos y
     * mayúsculas. Filtro en JS (SQLite no quita diacríticos); suficiente para el MVP.
     */
    async listar(q?: string): Promise<Cliente[]> {
      const todos = await db.all<Cliente>(`SELECT ${COLS} FROM cliente WHERE deleted_at IS NULL ORDER BY nombre`);
      if (!q || !q.trim()) return todos;
      const t = normalizar(q);
      return todos.filter((c) =>
        [c.nombre, c.apellidos, c.telefono, c.correo]
          .filter(Boolean)
          .some((campo) => normalizar(String(campo)).includes(t)),
      );
    },
  };
}

export type ClienteRepo = ReturnType<typeof crearClienteRepo>;
