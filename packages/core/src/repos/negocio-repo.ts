import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, esCorreoValido, esRncValido, type ErrorValidacion } from "../dominio/validacion.js";
import { ValidacionError } from "./producto-repo.js";
import type { Negocio } from "./tipos.js";

/**
 * Configuración mínima del MVP: datos del negocio, ancho de impresora y redondeo.
 * Es un singleton lógico (una sola fila de negocio); `obtener` trae la primera.
 */
export interface NegocioInput {
  nombre_comercial: string;
  razon_social?: string | null;
  rnc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  correo?: string | null;
  regimen?: string | null;
  ancho_impresora_default?: 58 | 80;
  redondeo_centavo?: boolean;
  inventario_activo?: boolean;
}

export function validarNegocio(input: NegocioInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.nombre_comercial)) {
    errores.push({ campo: "nombre_comercial", mensaje: "El nombre comercial es obligatorio." });
  }
  if (tieneValor(input.correo) && !esCorreoValido(input.correo!)) {
    errores.push({ campo: "correo", mensaje: "El correo no tiene un formato válido." });
  }
  if (tieneValor(input.rnc) && !esRncValido(input.rnc!)) {
    errores.push({ campo: "rnc", mensaje: "El RNC no es válido." });
  }
  if (input.ancho_impresora_default && ![58, 80].includes(input.ancho_impresora_default)) {
    errores.push({ campo: "ancho_impresora_default", mensaje: "El ancho debe ser 58 o 80 mm." });
  }
  return errores;
}

const COLS = `id, nombre_comercial, razon_social, rnc, direccion, telefono, correo,
  logo_ruta, regimen, ancho_impresora_default, redondeo_centavo, inventario_activo,
  created_at, updated_at, deleted_at`;

export function crearNegocioRepo(db: SqlDriver) {
  return {
    /** Trae la configuración del negocio (singleton), o undefined si no existe. */
    async obtener(): Promise<Negocio | undefined> {
      return db.get<Negocio>(`SELECT ${COLS} FROM negocio WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`);
    },

    /** Crea la config si no existe, o actualiza la existente. */
    async guardar(input: NegocioInput): Promise<Negocio> {
      const errores = validarNegocio(input);
      if (errores.length) throw new ValidacionError(errores);

      const actual = await this.obtener();
      const ts = now();

      if (!actual) {
        const n: Negocio = {
          id: newId(),
          nombre_comercial: input.nombre_comercial.trim(),
          razon_social: input.razon_social ?? null,
          rnc: input.rnc ?? null,
          direccion: input.direccion ?? null,
          telefono: input.telefono ?? null,
          correo: input.correo ?? null,
          logo_ruta: null,
          regimen: input.regimen ?? null,
          ancho_impresora_default: input.ancho_impresora_default ?? 80,
          redondeo_centavo: input.redondeo_centavo === false ? 0 : 1,
          inventario_activo: input.inventario_activo ? 1 : 0,
          created_at: ts,
          updated_at: ts,
          deleted_at: null,
        };
        await db.run(`INSERT INTO negocio (${COLS}) VALUES (${Array(15).fill("?").join(",")})`, [
          n.id,
          n.nombre_comercial,
          n.razon_social,
          n.rnc,
          n.direccion,
          n.telefono,
          n.correo,
          n.logo_ruta,
          n.regimen,
          n.ancho_impresora_default,
          n.redondeo_centavo,
          n.inventario_activo,
          n.created_at,
          n.updated_at,
          n.deleted_at,
        ]);
        return n;
      }

      await db.run(
        `UPDATE negocio SET nombre_comercial=?, razon_social=?, rnc=?, direccion=?, telefono=?,
           correo=?, regimen=?, ancho_impresora_default=?, redondeo_centavo=?, inventario_activo=?,
           updated_at=?
         WHERE id=?`,
        [
          input.nombre_comercial.trim(),
          input.razon_social ?? actual.razon_social,
          input.rnc ?? actual.rnc,
          input.direccion ?? actual.direccion,
          input.telefono ?? actual.telefono,
          input.correo ?? actual.correo,
          input.regimen ?? actual.regimen,
          input.ancho_impresora_default ?? actual.ancho_impresora_default,
          input.redondeo_centavo === false ? 0 : 1,
          input.inventario_activo ? 1 : 0,
          ts,
          actual.id,
        ],
      );
      return (await this.obtener())!;
    },
  };
}

export type NegocioRepo = ReturnType<typeof crearNegocioRepo>;
