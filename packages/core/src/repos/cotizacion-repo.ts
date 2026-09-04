import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, type ErrorValidacion } from "../dominio/validacion.js";
import { calcularLinea, calcularTotales, type LineaInput } from "../dominio/factura.js";
import { ValidacionError } from "./producto-repo.js";
import type { ImpuestoTipo } from "../dominio/impuesto.js";
import type { Cotizacion, CotizacionLinea } from "./tipos.js";

/**
 * Repo de cotizaciones (§ Ventas): precio ofrecido a un cliente antes de la
 * venta. A propósito es una entidad separada de `factura` — sin pagos, sin
 * comprobante fiscal, sin afectar existencia — así una cotización que nunca
 * se concreta no deja rastro en ventas ni en inventario.
 */

export interface LineaCotizacionInput {
  /** null = artículo no registrado en el catálogo. */
  producto_id?: string | null;
  descripcion: string;
  cantidad: number;
  /** Precio unitario final (ITBIS incluido) a usar en esta línea. */
  precioUnitario: number;
  impuestoTipo: ImpuestoTipo;
  tasaImpuesto: number;
}

export interface CrearCotizacionInput {
  cliente_id?: string | null;
  usuario_id?: string | null;
  notas?: string | null;
  /** Días de vigencia desde hoy; por defecto 15. */
  diasVigencia?: number;
  lineas: LineaCotizacionInput[];
}

export interface FiltroCotizaciones {
  /** Fecha ISO (yyyy-mm-dd), inclusive. */
  desde?: string | null;
  /** Fecha ISO (yyyy-mm-dd), inclusive. */
  hasta?: string | null;
  clienteId?: string | null;
}

function validarLineas(lineas: LineaCotizacionInput[]): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (lineas.length === 0) {
    errores.push({ campo: "lineas", mensaje: "La cotización no tiene artículos." });
  }
  for (const l of lineas) {
    if (!tieneValor(l.descripcion)) {
      errores.push({ campo: "descripcion", mensaje: "La descripción del artículo es obligatoria." });
    }
    if (!(l.cantidad > 0)) {
      errores.push({ campo: "cantidad", mensaje: "La cantidad debe ser mayor que cero." });
    }
  }
  return errores;
}

function sumarDias(fechaIso: string, dias: number): string {
  const d = new Date(fechaIso);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const COLS_COTIZACION = `id, numero_interno, fecha_hora, fecha_vencimiento, cliente_id, usuario_id,
  subtotal_gravado, subtotal_exento, total_itbis, total, notas, estado, factura_id,
  created_at, updated_at, deleted_at`;

const COLS_LINEA = `id, cotizacion_id, producto_id, descripcion, cantidad, precio_unitario,
  impuesto_tipo, tasa_impuesto, monto_itbis, subtotal, created_at, updated_at, deleted_at`;

export function crearCotizacionRepo(db: SqlDriver) {
  const repo = {
    /** Crea la cotización completa (encabezado + líneas) a partir de lo que haya en el ticket. */
    async crear(input: CrearCotizacionInput): Promise<Cotizacion> {
      const errores = validarLineas(input.lineas);
      if (errores.length) throw new ValidacionError(errores);

      const ultimo = await db.get<{ max: number | null }>("SELECT MAX(numero_interno) as max FROM cotizacion");
      const numero_interno = (ultimo?.max ?? 0) + 1;
      const ts = now();

      const entrada: LineaInput[] = input.lineas.map((l) => ({
        precioUnitario: l.precioUnitario,
        cantidad: l.cantidad,
        tasaImpuesto: l.tasaImpuesto,
      }));
      const t = calcularTotales(entrada);

      const c: Cotizacion = {
        id: newId(),
        numero_interno,
        fecha_hora: ts,
        fecha_vencimiento: sumarDias(ts, input.diasVigencia ?? 15),
        cliente_id: input.cliente_id ?? null,
        usuario_id: input.usuario_id ?? null,
        subtotal_gravado: t.subtotalGravado,
        subtotal_exento: t.subtotalExento,
        total_itbis: t.totalItbis,
        total: t.total,
        notas: input.notas ?? null,
        estado: "vigente",
        factura_id: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO cotizacion (${COLS_COTIZACION}) VALUES (${Array(16).fill("?").join(",")})`, [
        c.id,
        c.numero_interno,
        c.fecha_hora,
        c.fecha_vencimiento,
        c.cliente_id,
        c.usuario_id,
        c.subtotal_gravado,
        c.subtotal_exento,
        c.total_itbis,
        c.total,
        c.notas,
        c.estado,
        c.factura_id,
        c.created_at,
        c.updated_at,
        c.deleted_at,
      ]);

      for (const l of input.lineas) {
        const calc = calcularLinea({
          precioUnitario: l.precioUnitario,
          cantidad: l.cantidad,
          tasaImpuesto: l.tasaImpuesto,
        });
        const linea: CotizacionLinea = {
          id: newId(),
          cotizacion_id: c.id,
          producto_id: l.producto_id ?? null,
          descripcion: l.descripcion.trim(),
          cantidad: l.cantidad,
          precio_unitario: l.precioUnitario,
          impuesto_tipo: l.impuestoTipo,
          tasa_impuesto: l.tasaImpuesto,
          monto_itbis: calc.montoItbis,
          subtotal: calc.subtotal,
          created_at: ts,
          updated_at: ts,
          deleted_at: null,
        };
        await db.run(`INSERT INTO cotizacion_linea (${COLS_LINEA}) VALUES (${Array(13).fill("?").join(",")})`, [
          linea.id,
          linea.cotizacion_id,
          linea.producto_id,
          linea.descripcion,
          linea.cantidad,
          linea.precio_unitario,
          linea.impuesto_tipo,
          linea.tasa_impuesto,
          linea.monto_itbis,
          linea.subtotal,
          linea.created_at,
          linea.updated_at,
          linea.deleted_at,
        ]);
      }

      return c;
    },

    async obtener(id: string): Promise<Cotizacion | undefined> {
      return db.get<Cotizacion>(`SELECT ${COLS_COTIZACION} FROM cotizacion WHERE id=? AND deleted_at IS NULL`, [id]);
    },

    async obtenerLineas(cotizacionId: string): Promise<CotizacionLinea[]> {
      return db.all<CotizacionLinea>(
        `SELECT ${COLS_LINEA} FROM cotizacion_linea
         WHERE cotizacion_id=? AND deleted_at IS NULL
         ORDER BY created_at`,
        [cotizacionId],
      );
    },

    /** Historial de cotizaciones (pantalla Facturas § pestaña Cotizaciones), más recientes primero. */
    async listar(filtro: FiltroCotizaciones = {}): Promise<Cotizacion[]> {
      const condiciones = ["deleted_at IS NULL"];
      const params: unknown[] = [];
      if (filtro.desde) {
        condiciones.push("date(fecha_hora) >= date(?)");
        params.push(filtro.desde);
      }
      if (filtro.hasta) {
        condiciones.push("date(fecha_hora) <= date(?)");
        params.push(filtro.hasta);
      }
      if (filtro.clienteId) {
        condiciones.push("cliente_id = ?");
        params.push(filtro.clienteId);
      }
      return db.all<Cotizacion>(
        `SELECT ${COLS_COTIZACION} FROM cotizacion WHERE ${condiciones.join(" AND ")} ORDER BY fecha_hora DESC`,
        params,
      );
    },

    /** Anula la cotización (no se borra: queda en el historial marcada como anulada). */
    async anular(id: string): Promise<void> {
      await db.run("UPDATE cotizacion SET estado='anulada', updated_at=? WHERE id=?", [now(), id]);
    },
  };

  return repo;
}

export type CotizacionRepo = ReturnType<typeof crearCotizacionRepo>;
