import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { calcularCorteCaja } from "../dominio/caja.js";
import { tieneValor, type ErrorValidacion } from "../dominio/validacion.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { CorteCaja } from "./tipos.js";

/** Totales de ventas cobradas en un período (para armar el corte de caja). */
export interface ResumenPeriodoVentas {
  desde: string;
  hasta: string;
  cantidadFacturas: number;
  totalVentas: number;
  totalItbis: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalCredito: number;
}

export interface RegistrarCorteInput {
  cajaId?: string | null;
  usuarioId?: string | null;
  desde: string;
  hasta: string;
  montoInicial: number;
  efectivoContado: number;
}

const COLS = `id, caja_id, usuario_id, fecha_apertura, fecha_cierre, monto_inicial,
  total_ventas, total_itbis, total_efectivo, total_tarjeta, total_transferencia,
  total_credito, efectivo_esperado, efectivo_contado, diferencia, estado,
  created_at, updated_at, deleted_at`;

function validarPeriodo(desde: string, hasta: string): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(desde) || !tieneValor(hasta)) {
    errores.push({ campo: "periodo", mensaje: "Debe indicar la fecha desde y hasta." });
  } else if (desde > hasta) {
    errores.push({ campo: "periodo", mensaje: "La fecha 'desde' no puede ser posterior a 'hasta'." });
  }
  return errores;
}

export function crearCorteCajaRepo(db: SqlDriver) {
  return {
    /** Totales de ventas cobradas entre `desde` y `hasta` (fechas ISO, inclusive). */
    async calcularResumen(desde: string, hasta: string): Promise<ResumenPeriodoVentas> {
      const errores = validarPeriodo(desde, hasta);
      if (errores.length) throw new ValidacionError(errores);

      const agregada = await db.get<{ cantidad: number; totalVentas: number | null; totalItbis: number | null }>(
        `SELECT COUNT(*) as cantidad, SUM(total) as totalVentas, SUM(total_itbis) as totalItbis
         FROM factura
         WHERE estado='cobrada' AND deleted_at IS NULL
           AND date(fecha_hora) >= date(?) AND date(fecha_hora) <= date(?)`,
        [desde, hasta],
      );

      const porMetodo = await db.all<{ metodo: string; total: number }>(
        `SELECT p.metodo as metodo, SUM(p.monto) as total
         FROM pago p
         JOIN factura f ON f.id = p.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND p.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)
         GROUP BY p.metodo`,
        [desde, hasta],
      );
      const totales = { efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0 };
      for (const fila of porMetodo) {
        if (fila.metodo in totales) totales[fila.metodo as keyof typeof totales] = fila.total;
      }

      return {
        desde,
        hasta,
        cantidadFacturas: agregada?.cantidad ?? 0,
        totalVentas: agregada?.totalVentas ?? 0,
        totalItbis: agregada?.totalItbis ?? 0,
        totalEfectivo: totales.efectivo,
        totalTarjeta: totales.tarjeta,
        totalTransferencia: totales.transferencia,
        totalCredito: totales.credito,
      };
    },

    /** Calcula el resumen del período y registra el corte (cerrado) con el efectivo contado. */
    async registrarCorte(input: RegistrarCorteInput): Promise<CorteCaja> {
      const errores = validarPeriodo(input.desde, input.hasta);
      if (input.montoInicial < 0) {
        errores.push({ campo: "montoInicial", mensaje: "El monto inicial no puede ser negativo." });
      }
      if (input.efectivoContado < 0) {
        errores.push({ campo: "efectivoContado", mensaje: "El efectivo contado no puede ser negativo." });
      }
      if (errores.length) throw new ValidacionError(errores);

      const resumen = await this.calcularResumen(input.desde, input.hasta);
      const { efectivoEsperado, diferencia } = calcularCorteCaja({
        montoInicial: input.montoInicial,
        totalEfectivo: resumen.totalEfectivo,
        efectivoContado: input.efectivoContado,
      });

      const ts = now();
      const c: CorteCaja = {
        id: newId(),
        caja_id: input.cajaId ?? null,
        usuario_id: input.usuarioId ?? null,
        fecha_apertura: input.desde,
        fecha_cierre: input.hasta,
        monto_inicial: input.montoInicial,
        total_ventas: resumen.totalVentas,
        total_itbis: resumen.totalItbis,
        total_efectivo: resumen.totalEfectivo,
        total_tarjeta: resumen.totalTarjeta,
        total_transferencia: resumen.totalTransferencia,
        total_credito: resumen.totalCredito,
        efectivo_esperado: efectivoEsperado,
        efectivo_contado: input.efectivoContado,
        diferencia,
        estado: "cerrado",
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(
        `INSERT INTO corte_caja (${COLS}) VALUES (${Array(19).fill("?").join(",")})`,
        [
          c.id, c.caja_id, c.usuario_id, c.fecha_apertura, c.fecha_cierre, c.monto_inicial,
          c.total_ventas, c.total_itbis, c.total_efectivo, c.total_tarjeta, c.total_transferencia,
          c.total_credito, c.efectivo_esperado, c.efectivo_contado, c.diferencia, c.estado,
          c.created_at, c.updated_at, c.deleted_at,
        ],
      );
      await registrarAccion(db, {
        accion: "cerrar_caja", entidad: "corte_caja", entidadId: c.id,
        resumen: `Período ${c.fecha_apertura} a ${c.fecha_cierre}, diferencia RD$ ${c.diferencia.toFixed(2)}`,
      });
      return c;
    },

    async listar(): Promise<CorteCaja[]> {
      return db.all<CorteCaja>(
        `SELECT ${COLS} FROM corte_caja WHERE deleted_at IS NULL ORDER BY fecha_cierre DESC, created_at DESC`,
      );
    },
  };
}

export type CorteCajaRepo = ReturnType<typeof crearCorteCajaRepo>;
