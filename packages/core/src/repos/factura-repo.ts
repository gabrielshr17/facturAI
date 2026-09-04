import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, type ErrorValidacion } from "../dominio/validacion.js";
import {
  calcularLinea,
  calcularTotales,
  procesarCobro,
  type LineaInput,
  type PagoInput,
} from "../dominio/factura.js";
import { evaluarDisponibilidad } from "../dominio/inventario.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { ImpuestoTipo } from "../dominio/impuesto.js";
import type { Factura, FacturaLinea, Pago } from "./tipos.js";
import { MSG } from "../dominio/mensajes.js";

/**
 * Repo de "tickets" de venta (pantalla Ventas, §7.1). Un ticket es una `factura`
 * en estado `abierta`: se arman líneas, se recalculan totales tras cada cambio,
 * y queda lista para el cobro (Fase 1.4, que la pasa a `cobrada`).
 */

export interface AbrirTicketInput {
  caja_id?: string | null;
  usuario_id?: string | null;
  cliente_id?: string | null;
}

export interface FiltroFacturasCobradas {
  /** Fecha ISO (yyyy-mm-dd), inclusive. */
  desde?: string | null;
  /** Fecha ISO (yyyy-mm-dd), inclusive. */
  hasta?: string | null;
  clienteId?: string | null;
  tipo?: "normal" | "fiscal" | null;
}

export interface SincronizarPrecioProductoInput {
  productoId: string;
  precioVenta: number;
  precioMayoreo: number | null;
  impuestoTipo: ImpuestoTipo;
  tasaImpuesto: number;
}

export interface AgregarLineaInput {
  /** null = artículo no registrado en el catálogo. */
  producto_id?: string | null;
  descripcion: string;
  cantidad: number;
  /** Precio unitario final (ITBIS incluido) a usar en esta línea. */
  precioUnitario: number;
  esMayoreo?: boolean;
  impuestoTipo: ImpuestoTipo;
  tasaImpuesto: number;
}

function validarLinea(input: AgregarLineaInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.descripcion)) {
    errores.push({ campo: "descripcion", mensaje: "La descripción del artículo es obligatoria." });
  }
  if (!(input.cantidad > 0)) {
    errores.push({ campo: "cantidad", mensaje: "La cantidad debe ser mayor que cero." });
  }
  if (input.precioUnitario < 0) {
    errores.push({ campo: "precioUnitario", mensaje: "El precio no puede ser negativo." });
  }
  return errores;
}

function validarPagos(pagos: PagoInput[]): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (pagos.length === 0) {
    errores.push({ campo: "pagos", mensaje: "Debe ingresar al menos un método de pago." });
  }
  if (pagos.some((p) => p.monto <= 0)) {
    errores.push({ campo: "pagos", mensaje: "El monto de cada pago debe ser mayor que cero." });
  }
  return errores;
}

const COLS_FACTURA = `id, numero_interno, fecha_hora, cliente_id, caja_id, usuario_id, tipo,
  subtotal_gravado, subtotal_exento, total_itbis, total, monto_pagado, cambio, notas, estado,
  comprobante_id, created_at, updated_at, deleted_at`;

const COLS_LINEA = `id, factura_id, producto_id, descripcion, cantidad, precio_unitario,
  es_mayoreo, impuesto_tipo, tasa_impuesto, monto_itbis, subtotal, created_at, updated_at, deleted_at`;

const COLS_PAGO = `id, factura_id, metodo, monto, referencia, created_at, updated_at, deleted_at`;

export function crearFacturaRepo(db: SqlDriver) {
  /**
   * Si inventario está activo y el producto tiene política 'bloquear', rechaza
   * cuando la cantidad solicitada excede la existencia. Con 'advertir' o
   * inventario apagado, no bloquea (la UI puede avisar usando los mismos datos
   * del producto, que ya tiene en mano al buscarlo).
   */
  async function verificarDisponibilidad(productoId: string, cantidad: number): Promise<void> {
    const negocio = await db.get<{ inventario_activo: number }>(
      "SELECT inventario_activo FROM negocio LIMIT 1",
    );
    const producto = await db.get<{ existencia: number | null; politica_sin_existencia: "bloquear" | "advertir" }>(
      "SELECT existencia, politica_sin_existencia FROM producto WHERE id=?",
      [productoId],
    );
    if (!producto) return;

    const { permitido, faltante } = evaluarDisponibilidad({
      inventarioActivo: negocio?.inventario_activo === 1,
      existencia: producto.existencia,
      politica: producto.politica_sin_existencia,
      cantidadSolicitada: cantidad,
    });
    if (!permitido) {
      throw new ValidacionError([
        { campo: "cantidad", mensaje: `No hay existencia suficiente (faltan ${faltante}).` },
      ]);
    }
  }

  /** Descuenta existencia y registra el movimiento 'venta' (solo si inventario está activo). */
  async function descontarExistenciaPorVenta(facturaId: string, lineas: FacturaLinea[]): Promise<void> {
    const negocio = await db.get<{ inventario_activo: number }>(
      "SELECT inventario_activo FROM negocio LIMIT 1",
    );
    if (negocio?.inventario_activo !== 1) return;

    const ts = now();
    for (const l of lineas) {
      if (!l.producto_id) continue;
      const producto = await db.get<{ existencia: number | null; costo: number }>(
        "SELECT existencia, costo FROM producto WHERE id=?",
        [l.producto_id],
      );
      if (!producto) continue;

      const nuevaExistencia = (producto.existencia ?? 0) - l.cantidad;
      await db.run("UPDATE producto SET existencia=?, updated_at=? WHERE id=?", [
        nuevaExistencia, ts, l.producto_id,
      ]);
      await db.run(
        `INSERT INTO movimiento_inventario
           (id, producto_id, tipo, cantidad, costo, referencia_tipo, referencia_id, fecha, usuario_id, created_at, updated_at, deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [newId(), l.producto_id, "venta", -l.cantidad, producto.costo, "factura", facturaId, ts, null, ts, ts, null],
      );
    }
  }

  async function recalcularTotales(facturaId: string): Promise<void> {
    const lineas = await db.all<FacturaLinea>(
      `SELECT ${COLS_LINEA} FROM factura_linea WHERE factura_id=? AND deleted_at IS NULL`,
      [facturaId],
    );
    const entrada: LineaInput[] = lineas.map((l) => ({
      precioUnitario: l.precio_unitario,
      cantidad: l.cantidad,
      tasaImpuesto: l.tasa_impuesto,
    }));
    const t = calcularTotales(entrada);
    await db.run(
      `UPDATE factura SET subtotal_gravado=?, subtotal_exento=?, total_itbis=?, total=?, updated_at=?
       WHERE id=?`,
      [t.subtotalGravado, t.subtotalExento, t.totalItbis, t.total, now(), facturaId],
    );
  }

  const repo = {
    /** Abre un ticket nuevo (factura en estado 'abierta', totales en cero). */
    async abrirTicket(input: AbrirTicketInput = {}): Promise<Factura> {
      const ultimo = await db.get<{ max: number | null }>(
        "SELECT MAX(numero_interno) as max FROM factura",
      );
      const numero_interno = (ultimo?.max ?? 0) + 1;
      const ts = now();

      const f: Factura = {
        id: newId(),
        numero_interno,
        fecha_hora: ts,
        cliente_id: input.cliente_id ?? null,
        caja_id: input.caja_id ?? null,
        usuario_id: input.usuario_id ?? null,
        tipo: "normal",
        subtotal_gravado: 0,
        subtotal_exento: 0,
        total_itbis: 0,
        total: 0,
        monto_pagado: 0,
        cambio: 0,
        notas: null,
        estado: "abierta",
        comprobante_id: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(
        `INSERT INTO factura (${COLS_FACTURA}) VALUES (${Array(19).fill("?").join(",")})`,
        [
          f.id, f.numero_interno, f.fecha_hora, f.cliente_id, f.caja_id, f.usuario_id, f.tipo,
          f.subtotal_gravado, f.subtotal_exento, f.total_itbis, f.total, f.monto_pagado, f.cambio,
          f.notas, f.estado, f.comprobante_id, f.created_at, f.updated_at, f.deleted_at,
        ],
      );
      return f;
    },

    /** Tickets abiertos (para la barra de "tickets abiertos" en Ventas). */
    async listarAbiertos(): Promise<Factura[]> {
      return db.all<Factura>(
        `SELECT ${COLS_FACTURA} FROM factura
         WHERE estado='abierta' AND deleted_at IS NULL
         ORDER BY fecha_hora`,
      );
    },

    async obtener(id: string): Promise<Factura | undefined> {
      return db.get<Factura>(
        `SELECT ${COLS_FACTURA} FROM factura WHERE id=? AND deleted_at IS NULL`,
        [id],
      );
    },

    async obtenerLineas(facturaId: string): Promise<FacturaLinea[]> {
      return db.all<FacturaLinea>(
        `SELECT ${COLS_LINEA} FROM factura_linea
         WHERE factura_id=? AND deleted_at IS NULL
         ORDER BY created_at`,
        [facturaId],
      );
    },

    /** Agrega una línea (producto registrado o artículo suelto) y recalcula totales. */
    async agregarLinea(facturaId: string, input: AgregarLineaInput): Promise<FacturaLinea> {
      const errores = validarLinea(input);
      if (errores.length) throw new ValidacionError(errores);
      if (input.producto_id) await verificarDisponibilidad(input.producto_id, input.cantidad);

      const calc = calcularLinea({
        precioUnitario: input.precioUnitario,
        cantidad: input.cantidad,
        tasaImpuesto: input.tasaImpuesto,
      });

      const ts = now();
      const l: FacturaLinea = {
        id: newId(),
        factura_id: facturaId,
        producto_id: input.producto_id ?? null,
        descripcion: input.descripcion.trim(),
        cantidad: input.cantidad,
        precio_unitario: input.precioUnitario,
        es_mayoreo: input.esMayoreo ? 1 : 0,
        impuesto_tipo: input.impuestoTipo,
        tasa_impuesto: input.tasaImpuesto,
        monto_itbis: calc.montoItbis,
        subtotal: calc.subtotal,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(
        `INSERT INTO factura_linea (${COLS_LINEA}) VALUES (${Array(14).fill("?").join(",")})`,
        [
          l.id, l.factura_id, l.producto_id, l.descripcion, l.cantidad, l.precio_unitario,
          l.es_mayoreo, l.impuesto_tipo, l.tasa_impuesto, l.monto_itbis, l.subtotal,
          l.created_at, l.updated_at, l.deleted_at,
        ],
      );
      await recalcularTotales(facturaId);
      return l;
    },

    /** Cambia la cantidad de una línea (sumar/restar) y recalcula. */
    async actualizarCantidadLinea(lineaId: string, cantidad: number): Promise<void> {
      if (!(cantidad > 0)) {
        throw new ValidacionError([{ campo: "cantidad", mensaje: "La cantidad debe ser mayor que cero." }]);
      }
      const linea = await db.get<FacturaLinea>(
        `SELECT ${COLS_LINEA} FROM factura_linea WHERE id=?`,
        [lineaId],
      );
      if (!linea) throw new Error(MSG.lineaNoExiste);
      if (linea.producto_id) await verificarDisponibilidad(linea.producto_id, cantidad);

      const calc = calcularLinea({
        precioUnitario: linea.precio_unitario,
        cantidad,
        tasaImpuesto: linea.tasa_impuesto,
      });

      await db.run(
        "UPDATE factura_linea SET cantidad=?, monto_itbis=?, subtotal=?, updated_at=? WHERE id=?",
        [cantidad, calc.montoItbis, calc.subtotal, now(), lineaId],
      );
      await recalcularTotales(linea.factura_id);
    },

    /** Borra (lógico) una línea y recalcula. */
    async eliminarLinea(lineaId: string): Promise<void> {
      const linea = await db.get<FacturaLinea>(
        `SELECT ${COLS_LINEA} FROM factura_linea WHERE id=?`,
        [lineaId],
      );
      if (!linea) return;
      await db.run("UPDATE factura_linea SET deleted_at=?, updated_at=? WHERE id=?", [
        now(), now(), lineaId,
      ]);
      await recalcularTotales(linea.factura_id);
    },

    /** Revierte el borrado lógico de una línea (§ deshacer/rehacer en Ventas, Ctrl+Z/Ctrl+Y) y
     *  recalcula. Como el borrado es lógico, la fila conserva sus datos originales tal cual — restaurar
     *  es exactamente el inverso de `eliminarLinea`, sin perder cantidad/precio/régimen mayoreo. */
    async restaurarLinea(lineaId: string): Promise<void> {
      const linea = await db.get<FacturaLinea>(
        `SELECT ${COLS_LINEA} FROM factura_linea WHERE id=?`,
        [lineaId],
      );
      if (!linea) return;
      if (linea.producto_id) await verificarDisponibilidad(linea.producto_id, linea.cantidad);
      await db.run("UPDATE factura_linea SET deleted_at=NULL, updated_at=? WHERE id=?", [
        now(), lineaId,
      ]);
      await recalcularTotales(linea.factura_id);
    },

    /** Asigna (o quita, con null) el cliente del ticket. */
    async asignarCliente(facturaId: string, clienteId: string | null): Promise<void> {
      await db.run("UPDATE factura SET cliente_id=?, updated_at=? WHERE id=?", [
        clienteId, now(), facturaId,
      ]);
    },

    async actualizarNotas(facturaId: string, notas: string): Promise<void> {
      await db.run("UPDATE factura SET notas=?, updated_at=? WHERE id=?", [notas, now(), facturaId]);
    },

    /**
     * Al corregir el precio de un producto (§ Productos/Ventas "Modificar"), refleja el precio
     * nuevo en las líneas de tickets TODAVÍA ABIERTOS que ya tenían ese producto agregado — así
     * quien lo agregó antes de la corrección no paga el precio viejo. Ventas ya `cobrada`s nunca
     * se tocan: cambiar el monto de una venta cerrada alteraría un registro contable ya cerrado
     * (y en el caso fiscal, ya reportado con un NCF por ese monto exacto).
     */
    async actualizarPrecioEnTicketsAbiertos(input: SincronizarPrecioProductoInput): Promise<void> {
      const lineas = await db.all<{ id: string; factura_id: string; cantidad: number; es_mayoreo: number }>(
        `SELECT fl.id, fl.factura_id, fl.cantidad, fl.es_mayoreo
         FROM factura_linea fl
         JOIN factura f ON f.id = fl.factura_id
         WHERE fl.producto_id=? AND fl.deleted_at IS NULL AND f.estado='abierta' AND f.deleted_at IS NULL`,
        [input.productoId],
      );

      const facturasAfectadas = new Set<string>();
      for (const l of lineas) {
        // Una línea a mayoreo usa el precio mayoreo nuevo; si ya no hay uno (se quitó del
        // producto), se deja la línea como estaba en vez de adivinar un precio.
        const nuevoPrecio = l.es_mayoreo ? input.precioMayoreo : input.precioVenta;
        if (nuevoPrecio == null) continue;

        const calc = calcularLinea({ precioUnitario: nuevoPrecio, cantidad: l.cantidad, tasaImpuesto: input.tasaImpuesto });
        await db.run(
          `UPDATE factura_linea
             SET precio_unitario=?, impuesto_tipo=?, tasa_impuesto=?, monto_itbis=?, subtotal=?, updated_at=?
           WHERE id=?`,
          [nuevoPrecio, input.impuestoTipo, input.tasaImpuesto, calc.montoItbis, calc.subtotal, now(), l.id],
        );
        facturasAfectadas.add(l.factura_id);
      }

      for (const facturaId of facturasAfectadas) await recalcularTotales(facturaId);
    },

    /** Elimina el ticket completo (factura + sus líneas), borrado lógico. */
    async eliminarTicket(facturaId: string): Promise<void> {
      const ts = now();
      await db.run("UPDATE factura_linea SET deleted_at=?, updated_at=? WHERE factura_id=?", [
        ts, ts, facturaId,
      ]);
      await db.run("UPDATE factura SET deleted_at=?, updated_at=? WHERE id=?", [ts, ts, facturaId]);
      await registrarAccion(db, { accion: "eliminar", entidad: "factura", entidadId: facturaId });
    },

    /**
     * Cobra un ticket abierto (§7.2): valida que tenga artículos y que los pagos
     * (uno o varios, mixto) cubran el total, registra los pagos, y marca la
     * factura como `cobrada` con el monto pagado y el cambio. La fecha/hora de
     * la factura se actualiza al momento del cobro (es cuando la venta se concreta).
     */
    async cobrar(
      facturaId: string,
      input: { pagos: PagoInput[]; notas?: string | null },
    ): Promise<{ factura: Factura; cambio: number }> {
      const factura = await this.obtener(facturaId);
      if (!factura) throw new Error(MSG.ticketNoExiste);
      if (factura.estado !== "abierta") {
        throw new ValidacionError([{ campo: "estado", mensaje: "Este ticket ya fue cobrado o anulado." }]);
      }

      const lineas = await this.obtenerLineas(facturaId);
      if (lineas.length === 0) {
        throw new ValidacionError([{ campo: "lineas", mensaje: "El ticket no tiene artículos." }]);
      }

      const erroresPago = validarPagos(input.pagos);
      if (erroresPago.length) throw new ValidacionError(erroresPago);

      const resultado = procesarCobro(factura.total, input.pagos);
      if (!resultado.suficiente) {
        throw new ValidacionError([
          { campo: "pagos", mensaje: `Falta por pagar RD$ ${resultado.faltante.toFixed(2)}.` },
        ]);
      }

      const ts = now();
      for (const p of input.pagos) {
        await db.run(
          `INSERT INTO pago (${COLS_PAGO}) VALUES (?,?,?,?,?,?,?,?)`,
          [newId(), facturaId, p.metodo, p.monto, null, ts, ts, null],
        );
      }

      await db.run(
        `UPDATE factura SET estado='cobrada', monto_pagado=?, cambio=?, notas=?, fecha_hora=?, updated_at=?
         WHERE id=?`,
        [resultado.montoPagado, resultado.cambio, input.notas ?? factura.notas, ts, ts, facturaId],
      );

      await descontarExistenciaPorVenta(facturaId, lineas);
      await registrarAccion(db, {
        accion: "cobrar", entidad: "factura", entidadId: facturaId,
        resumen: `Total RD$ ${factura.total.toFixed(2)}, cambio RD$ ${resultado.cambio.toFixed(2)}`,
      });

      return { factura: (await this.obtener(facturaId))!, cambio: resultado.cambio };
    },

    async obtenerPagos(facturaId: string): Promise<Pago[]> {
      return db.all<Pago>(
        `SELECT ${COLS_PAGO} FROM pago WHERE factura_id=? AND deleted_at IS NULL ORDER BY created_at`,
        [facturaId],
      );
    },

    /** Enlaza la factura a su comprobante fiscal y la marca tipo='fiscal'. */
    async marcarFiscal(facturaId: string, comprobanteId: string): Promise<void> {
      await db.run(
        "UPDATE factura SET tipo='fiscal', comprobante_id=?, updated_at=? WHERE id=?",
        [comprobanteId, now(), facturaId],
      );
    },

    /** Última factura cobrada (para "reimprimir último ticket"). */
    async obtenerUltimaCobrada(): Promise<Factura | undefined> {
      return db.get<Factura>(
        `SELECT ${COLS_FACTURA} FROM factura
         WHERE estado='cobrada' AND deleted_at IS NULL
         ORDER BY fecha_hora DESC LIMIT 1`,
      );
    },

    /** Ventas ya cobradas (pantalla Consulta de facturas), más recientes primero. */
    async listarCobradas(filtro: FiltroFacturasCobradas = {}): Promise<Factura[]> {
      const condiciones = ["estado='cobrada'", "deleted_at IS NULL"];
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
      if (filtro.tipo) {
        condiciones.push("tipo = ?");
        params.push(filtro.tipo);
      }
      return db.all<Factura>(
        `SELECT ${COLS_FACTURA} FROM factura WHERE ${condiciones.join(" AND ")} ORDER BY fecha_hora DESC`,
        params,
      );
    },
  };

  return repo;
}

export type FacturaRepo = ReturnType<typeof crearFacturaRepo>;
