import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import type { ErrorValidacion } from "../dominio/validacion.js";
import type { TipoEcf } from "../dominio/ecf.js";
import { ValidacionError } from "./producto-repo.js";
import type { SecuenciaNcf, EstadoSecuencia } from "./tipos.js";

/**
 * Secuencias autorizadas por la DGII (§6). Rango + vencimiento por tipo de
 * e-CF; el sistema avisa por umbral bajo y bloquea la emisión si no hay
 * secuencia válida (`obtenerVigente` recalcula el estado real en cada consulta:
 * `vencida` si pasó la fecha, `agotada` si no quedan números).
 */

/** A partir de este número de comprobantes restantes, se considera "umbral bajo". */
export const UMBRAL_BAJO = 50;

export interface SecuenciaNcfInput {
  tipoEcf: TipoEcf;
  rangoDesde: number;
  rangoHasta: number;
  /** Fecha ISO (YYYY-MM-DD). */
  vencimiento: string;
}

function validar(input: SecuenciaNcfInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (input.rangoDesde > input.rangoHasta) {
    errores.push({ campo: "rango", mensaje: "El rango desde no puede ser mayor que el rango hasta." });
  }
  if (input.rangoDesde < 1) {
    errores.push({ campo: "rango", mensaje: "El rango debe iniciar en 1 o más." });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.vencimiento)) {
    errores.push({ campo: "vencimiento", mensaje: "La fecha de vencimiento debe tener formato AAAA-MM-DD." });
  }
  return errores;
}

/** Recalcula el estado real (vencida/agotada/disponible) según fecha y consumo. */
function calcularEstado(s: Pick<SecuenciaNcf, "vencimiento" | "proximo_numero" | "rango_hasta">, hoy: string): EstadoSecuencia {
  if (s.vencimiento < hoy) return "vencida";
  if (s.proximo_numero > s.rango_hasta) return "agotada";
  return "disponible";
}

const COLS = `id, tipo_ecf, prefijo, modo, rango_desde, rango_hasta, proximo_numero,
  vencimiento, estado, created_at, updated_at, deleted_at`;

export function crearSecuenciaNcfRepo(db: SqlDriver) {
  return {
    async crear(input: SecuenciaNcfInput): Promise<SecuenciaNcf> {
      const errores = validar(input);
      if (errores.length) throw new ValidacionError(errores);

      const ts = now();
      const s: SecuenciaNcf = {
        id: newId(),
        tipo_ecf: input.tipoEcf,
        prefijo: `E${input.tipoEcf}`,
        modo: "ecf",
        rango_desde: input.rangoDesde,
        rango_hasta: input.rangoHasta,
        proximo_numero: input.rangoDesde,
        vencimiento: input.vencimiento,
        estado: calcularEstado(
          { vencimiento: input.vencimiento, proximo_numero: input.rangoDesde, rango_hasta: input.rangoHasta },
          now().slice(0, 10),
        ),
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(
        `INSERT INTO secuencia_ncf (${COLS}) VALUES (${Array(12).fill("?").join(",")})`,
        [
          s.id, s.tipo_ecf, s.prefijo, s.modo, s.rango_desde, s.rango_hasta, s.proximo_numero,
          s.vencimiento, s.estado, s.created_at, s.updated_at, s.deleted_at,
        ],
      );
      return s;
    },

    async listar(): Promise<SecuenciaNcf[]> {
      const filas = await db.all<SecuenciaNcf>(
        `SELECT ${COLS} FROM secuencia_ncf WHERE deleted_at IS NULL ORDER BY tipo_ecf, vencimiento`,
      );
      const hoy = now().slice(0, 10);
      // Refresca estado (vencida/agotada) al vuelo para que la UI de Configuración lo vea al día.
      const actualizadas: SecuenciaNcf[] = [];
      for (const s of filas) {
        const estadoReal = calcularEstado(s, hoy);
        if (estadoReal !== s.estado) {
          await db.run("UPDATE secuencia_ncf SET estado=?, updated_at=? WHERE id=?", [estadoReal, now(), s.id]);
        }
        actualizadas.push({ ...s, estado: estadoReal });
      }
      return actualizadas;
    },

    /** Secuencia disponible para un tipo (no vencida, no agotada), o undefined si no hay. */
    async obtenerVigente(tipoEcf: TipoEcf): Promise<SecuenciaNcf | undefined> {
      const candidatas = await db.all<SecuenciaNcf>(
        `SELECT ${COLS} FROM secuencia_ncf WHERE tipo_ecf=? AND deleted_at IS NULL ORDER BY vencimiento`,
        [tipoEcf],
      );
      const hoy = now().slice(0, 10);
      for (const s of candidatas) {
        const estadoReal = calcularEstado(s, hoy);
        if (estadoReal !== s.estado) {
          await db.run("UPDATE secuencia_ncf SET estado=?, updated_at=? WHERE id=?", [estadoReal, now(), s.id]);
        }
        if (estadoReal === "disponible") return { ...s, estado: estadoReal };
      }
      return undefined;
    },

    /** Consume el siguiente número de la secuencia (marca agotada si era el último). */
    async consumirSiguiente(secuenciaId: string): Promise<number> {
      const s = await db.get<SecuenciaNcf>(`SELECT ${COLS} FROM secuencia_ncf WHERE id=?`, [secuenciaId]);
      if (!s) throw new Error(`Secuencia ${secuenciaId} no existe`);
      if (s.proximo_numero > s.rango_hasta) {
        throw new ValidacionError([{ campo: "secuencia", mensaje: "La secuencia está agotada." }]);
      }
      const numero = s.proximo_numero;
      const siguiente = numero + 1;
      const nuevoEstado: EstadoSecuencia = siguiente > s.rango_hasta ? "agotada" : s.estado;
      await db.run(
        "UPDATE secuencia_ncf SET proximo_numero=?, estado=?, updated_at=? WHERE id=?",
        [siguiente, nuevoEstado, now(), secuenciaId],
      );
      return numero;
    },

    /** Cuántos números quedan; útil para el aviso de umbral bajo en Configuración. */
    restantes(s: Pick<SecuenciaNcf, "rango_hasta" | "proximo_numero">): number {
      return Math.max(0, s.rango_hasta - s.proximo_numero + 1);
    },
  };
}

export type SecuenciaNcfRepo = ReturnType<typeof crearSecuenciaNcfRepo>;
