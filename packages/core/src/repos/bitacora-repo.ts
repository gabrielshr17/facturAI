import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import type { BitacoraAccion, OrigenAccion } from "./tipos.js";

/**
 * Bitácora de acciones (§ Caja y auditoría, sección 8 del prompt original):
 * registro de "quién y cuándo" para acciones sensibles. Append-only — no
 * tiene `actualizar`/`eliminar` a propósito (es un registro de auditoría,
 * no debería poder editarse después de creado).
 */
export interface RegistrarAccionInput {
  usuarioId?: string | null;
  origen?: OrigenAccion;
  accion: string;
  entidad: string;
  entidadId?: string | null;
  resumen?: string | null;
  confirmada?: boolean;
}

export interface FiltroBitacora {
  entidad?: string | null;
  desde?: string | null;
  hasta?: string | null;
  limite?: number;
}

const COLS = `id, usuario_id, origen, accion, entidad, entidad_id, resumen, confirmada, timestamp`;

/**
 * Función compartida (no atada al closure del repo) para que otros repos
 * registren una acción sin necesidad de instanciar `crearBitacoraRepo` —
 * mismo patrón que `ValidacionError`, compartida directamente entre repos.
 */
export async function registrarAccion(db: SqlDriver, input: RegistrarAccionInput): Promise<BitacoraAccion> {
  const registro: BitacoraAccion = {
    id: newId(),
    usuario_id: input.usuarioId ?? null,
    origen: input.origen ?? "app",
    accion: input.accion,
    entidad: input.entidad,
    entidad_id: input.entidadId ?? null,
    resumen: input.resumen ?? null,
    confirmada: input.confirmada === false ? 0 : 1,
    timestamp: now(),
  };
  await db.run(
    `INSERT INTO bitacora_accion (${COLS}) VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      registro.id, registro.usuario_id, registro.origen, registro.accion, registro.entidad,
      registro.entidad_id, registro.resumen, registro.confirmada, registro.timestamp,
    ],
  );
  return registro;
}

export function crearBitacoraRepo(db: SqlDriver) {
  return {
    async registrar(input: RegistrarAccionInput): Promise<BitacoraAccion> {
      return registrarAccion(db, input);
    },

    /** Últimas acciones registradas, más reciente primero. */
    async listar(filtro: FiltroBitacora = {}): Promise<BitacoraAccion[]> {
      const condiciones: string[] = ["1=1"];
      const params: unknown[] = [];
      if (filtro.entidad) { condiciones.push("entidad = ?"); params.push(filtro.entidad); }
      if (filtro.desde) { condiciones.push("date(timestamp) >= date(?)"); params.push(filtro.desde); }
      if (filtro.hasta) { condiciones.push("date(timestamp) <= date(?)"); params.push(filtro.hasta); }

      const limite = filtro.limite ?? 100;
      return db.all<BitacoraAccion>(
        `SELECT ${COLS} FROM bitacora_accion WHERE ${condiciones.join(" AND ")}
         ORDER BY timestamp DESC LIMIT ?`,
        [...params, limite],
      );
    },
  };
}

export type BitacoraRepo = ReturnType<typeof crearBitacoraRepo>;
