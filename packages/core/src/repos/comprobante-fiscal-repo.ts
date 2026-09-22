import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import type { TipoEcf } from "../dominio/ecf.js";
import type { ComprobanteFiscal, EstadoDgii } from "./tipos.js";

export interface CrearComprobanteInput {
  facturaId: string;
  tipoEcf: TipoEcf;
  ncf: string;
  secuenciaId: string;
  rncEmisor: string | null;
  receptorDocumentoTipo: "rnc" | "cedula" | null;
  receptorDocumentoNumero: string | null;
  montoGravado: number;
  montoExento: number;
  montoItbis: number;
  total: number;
  estadoDgii: EstadoDgii;
  trackIdDgii?: string | null;
  codigoSeguridad?: string | null;
}

const COLS = `id, factura_id, tipo_ecf, ncf, secuencia_id, rnc_emisor, receptor_documento_tipo,
  receptor_documento_numero, fecha_emision, monto_gravado, monto_exento, monto_itbis, total,
  estado_dgii, track_id_dgii, codigo_seguridad, xml_firmado_ruta, qr_url, fecha_transmision,
  created_at, updated_at, deleted_at`;

export function crearComprobanteFiscalRepo(db: SqlDriver) {
  return {
    async crear(input: CrearComprobanteInput): Promise<ComprobanteFiscal> {
      const ts = now();
      const c: ComprobanteFiscal = {
        id: newId(),
        factura_id: input.facturaId,
        tipo_ecf: input.tipoEcf,
        ncf: input.ncf,
        secuencia_id: input.secuenciaId,
        rnc_emisor: input.rncEmisor,
        receptor_documento_tipo: input.receptorDocumentoTipo,
        receptor_documento_numero: input.receptorDocumentoNumero,
        fecha_emision: ts,
        monto_gravado: input.montoGravado,
        monto_exento: input.montoExento,
        monto_itbis: input.montoItbis,
        total: input.total,
        estado_dgii: input.estadoDgii,
        track_id_dgii: input.trackIdDgii ?? null,
        codigo_seguridad: input.codigoSeguridad ?? null,
        xml_firmado_ruta: null,
        qr_url: null,
        fecha_transmision: input.estadoDgii === "aceptado" ? ts : null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO comprobante_fiscal (${COLS}) VALUES (${Array(22).fill("?").join(",")})`, [
        c.id,
        c.factura_id,
        c.tipo_ecf,
        c.ncf,
        c.secuencia_id,
        c.rnc_emisor,
        c.receptor_documento_tipo,
        c.receptor_documento_numero,
        c.fecha_emision,
        c.monto_gravado,
        c.monto_exento,
        c.monto_itbis,
        c.total,
        c.estado_dgii,
        c.track_id_dgii,
        c.codigo_seguridad,
        c.xml_firmado_ruta,
        c.qr_url,
        c.fecha_transmision,
        c.created_at,
        c.updated_at,
        c.deleted_at,
      ]);
      return c;
    },

    async obtener(id: string): Promise<ComprobanteFiscal | undefined> {
      return db.get<ComprobanteFiscal>(`SELECT ${COLS} FROM comprobante_fiscal WHERE id=? AND deleted_at IS NULL`, [
        id,
      ]);
    },

    async obtenerPorFactura(facturaId: string): Promise<ComprobanteFiscal | undefined> {
      return db.get<ComprobanteFiscal>(
        `SELECT ${COLS} FROM comprobante_fiscal WHERE factura_id=? AND deleted_at IS NULL`,
        [facturaId],
      );
    },
  };
}

export type ComprobanteFiscalRepo = ReturnType<typeof crearComprobanteFiscalRepo>;
