import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import type { TipoEcf } from "../dominio/ecf.js";
import type { NcfAnulacion } from "./tipos.js";

export interface RegistrarNcfAnulacionInput {
  tipoEcf: TipoEcf;
  ncf: string;
  motivo: string | null;
}

const COLS = "id, tipo_ecf, ncf, motivo, estado, ultimo_mensaje_dgii, created_at, updated_at, deleted_at";

export function crearNcfAnulacionRepo(db: SqlDriver) {
  return {
    async registrar(input: RegistrarNcfAnulacionInput): Promise<void> {
      const ts = now();
      await db.run(
        `INSERT INTO ncf_anulacion (${COLS}) VALUES (?,?,?,?,?,?,?,?,?)
         ON CONFLICT(ncf) DO UPDATE SET motivo=excluded.motivo, updated_at=excluded.updated_at`,
        [newId(), input.tipoEcf, input.ncf, input.motivo, "pendiente", null, ts, ts, null],
      );
    },

    async listarPendientes(): Promise<NcfAnulacion[]> {
      return db.all<NcfAnulacion>(
        `SELECT ${COLS} FROM ncf_anulacion WHERE estado='pendiente' AND deleted_at IS NULL ORDER BY tipo_ecf, ncf`,
      );
    },

    async listarUtilizados(): Promise<NcfAnulacion[]> {
      return db.all<NcfAnulacion>(
        `SELECT ${COLS} FROM ncf_anulacion WHERE estado='utilizado' AND deleted_at IS NULL ORDER BY tipo_ecf, ncf`,
      );
    },

    async marcarUtilizados(ids: string[], mensaje: string): Promise<void> {
      const ts = now();
      for (const id of ids) {
        await db.run("UPDATE ncf_anulacion SET estado='utilizado', ultimo_mensaje_dgii=?, updated_at=? WHERE id=?", [
          mensaje,
          ts,
          id,
        ]);
      }
    },

    async marcarAnulados(ids: string[], mensaje: string | null): Promise<void> {
      const ts = now();
      for (const id of ids) {
        await db.run("UPDATE ncf_anulacion SET estado='anulado', ultimo_mensaje_dgii=?, updated_at=? WHERE id=?", [
          mensaje,
          ts,
          id,
        ]);
      }
    },

    async registrarIntentoFallido(ids: string[], mensaje: string): Promise<void> {
      const ts = now();
      for (const id of ids) {
        await db.run("UPDATE ncf_anulacion SET ultimo_mensaje_dgii=?, updated_at=? WHERE id=?", [mensaje, ts, id]);
      }
    },
  };
}

export type NcfAnulacionRepo = ReturnType<typeof crearNcfAnulacionRepo>;
