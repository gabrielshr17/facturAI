import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import type { ComprobanteArchivo } from "./tipos.js";

/**
 * Archivo adjunto de un comprobante de compra (foto/PDF), guardado inline
 * como base64 en SQLite: en modo 100% local no hay Storage todavía (llega
 * con el backend Fastify de Fase 2 avanzada). Suficiente para adjuntar y
 * archivar por mes a escala de un negocio pequeño.
 */
export interface CrearComprobanteArchivoInput {
  compraId?: string | null;
  nombreArchivo: string;
  tipoMime: string;
  contenidoBase64: string;
  mesAno: string; // 'AAAA-MM'
  tieneFiscal?: boolean;
}

const COLS = `id, compra_id, nombre_archivo, tipo_mime, contenido_base64, mes_ano,
  tiene_fiscal, estado_revision, identificado_por, datos_extraidos_json,
  created_at, updated_at, deleted_at`;

export function crearComprobanteArchivoRepo(db: SqlDriver) {
  return {
    async crear(input: CrearComprobanteArchivoInput): Promise<ComprobanteArchivo> {
      const ts = now();
      const a: ComprobanteArchivo = {
        id: newId(),
        compra_id: input.compraId ?? null,
        nombre_archivo: input.nombreArchivo,
        tipo_mime: input.tipoMime,
        contenido_base64: input.contenidoBase64,
        mes_ano: input.mesAno,
        tiene_fiscal: input.tieneFiscal ? 1 : 0,
        estado_revision: "confirmado_usuario",
        identificado_por: "usuario",
        datos_extraidos_json: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };
      await db.run(
        `INSERT INTO comprobante_archivo (${COLS}) VALUES (${Array(13).fill("?").join(",")})`,
        [
          a.id, a.compra_id, a.nombre_archivo, a.tipo_mime, a.contenido_base64, a.mes_ano,
          a.tiene_fiscal, a.estado_revision, a.identificado_por, a.datos_extraidos_json,
          a.created_at, a.updated_at, a.deleted_at,
        ],
      );
      return a;
    },

    async obtenerPorCompra(compraId: string): Promise<ComprobanteArchivo[]> {
      return db.all<ComprobanteArchivo>(
        `SELECT ${COLS} FROM comprobante_archivo WHERE compra_id=? AND deleted_at IS NULL ORDER BY created_at`,
        [compraId],
      );
    },

    async eliminar(id: string): Promise<void> {
      await db.run("UPDATE comprobante_archivo SET deleted_at=?, updated_at=? WHERE id=?", [now(), now(), id]);
    },
  };
}

export type ComprobanteArchivoRepo = ReturnType<typeof crearComprobanteArchivoRepo>;
