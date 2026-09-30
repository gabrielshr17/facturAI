import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import type { TipoEcf } from "../dominio/ecf.js";
import type { ComprobanteFiscal, EstadoDgii, EstadoEntrega } from "./tipos.js";

export interface CrearComprobanteInput {
  facturaId?: string | null;
  compraId?: string | null;
  tipoEcf: TipoEcf;
  ncf: string;
  secuenciaId: string;
  rncEmisor: string | null;
  receptorDocumentoTipo: "rnc" | "cedula" | null;
  receptorDocumentoNumero: string | null;
  receptorNombre?: string | null;
  montoGravado: number;
  montoExento: number;
  montoItbis: number;
  total: number;
  estadoDgii: EstadoDgii;
  trackIdDgii?: string | null;
  codigoSeguridad?: string | null;
  qrUrl?: string | null;
  fechaFirma?: string | null;
  xmlFirmado?: string | null;
  motivoRechazo?: string | null;
}

const COLS = `id, factura_id, compra_id, tipo_ecf, ncf, secuencia_id, rnc_emisor, receptor_documento_tipo,
  receptor_documento_numero, receptor_nombre, fecha_emision, monto_gravado, monto_exento, monto_itbis, total,
  estado_dgii, track_id_dgii, codigo_seguridad, xml_firmado_ruta, qr_url, fecha_transmision,
  fecha_firma, xml_firmado, motivo_rechazo, entrega_estado, entrega_detalle, acuse_recibo_xml,
  created_at, updated_at, deleted_at`;

const TIPOS_CON_ENTREGA: ReadonlySet<TipoEcf> = new Set(["31", "33", "34", "45"]);

function entregaInicial(tipoEcf: TipoEcf, receptorTipo: "rnc" | "cedula" | null): EstadoEntrega {
  return TIPOS_CON_ENTREGA.has(tipoEcf) && receptorTipo === "rnc" ? "pendiente" : "no_aplica";
}

const TRANSMITIDO: ReadonlySet<EstadoDgii> = new Set(["aceptado", "aceptado_condicional", "pendiente", "rechazado"]);

export function crearComprobanteFiscalRepo(db: SqlDriver) {
  return {
    async crear(input: CrearComprobanteInput): Promise<ComprobanteFiscal> {
      const ts = now();
      const c: ComprobanteFiscal = {
        id: newId(),
        factura_id: input.facturaId ?? null,
        compra_id: input.compraId ?? null,
        tipo_ecf: input.tipoEcf,
        ncf: input.ncf,
        secuencia_id: input.secuenciaId,
        rnc_emisor: input.rncEmisor,
        receptor_documento_tipo: input.receptorDocumentoTipo,
        receptor_documento_numero: input.receptorDocumentoNumero,
        receptor_nombre: input.receptorNombre ?? null,
        fecha_emision: ts,
        monto_gravado: input.montoGravado,
        monto_exento: input.montoExento,
        monto_itbis: input.montoItbis,
        total: input.total,
        estado_dgii: input.estadoDgii,
        track_id_dgii: input.trackIdDgii ?? null,
        codigo_seguridad: input.codigoSeguridad ?? null,
        xml_firmado_ruta: null,
        qr_url: input.qrUrl ?? null,
        fecha_transmision: TRANSMITIDO.has(input.estadoDgii) ? ts : null,
        fecha_firma: input.fechaFirma ?? null,
        xml_firmado: input.xmlFirmado ?? null,
        motivo_rechazo: input.motivoRechazo ?? null,
        entrega_estado: entregaInicial(input.tipoEcf, input.receptorDocumentoTipo),
        entrega_detalle: null,
        acuse_recibo_xml: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO comprobante_fiscal (${COLS}) VALUES (${Array(30).fill("?").join(",")})`, [
        c.id,
        c.factura_id,
        c.compra_id,
        c.tipo_ecf,
        c.ncf,
        c.secuencia_id,
        c.rnc_emisor,
        c.receptor_documento_tipo,
        c.receptor_documento_numero,
        c.receptor_nombre,
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
        c.fecha_firma,
        c.xml_firmado,
        c.motivo_rechazo,
        c.entrega_estado,
        c.entrega_detalle,
        c.acuse_recibo_xml,
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

    async obtenerPorCompra(compraId: string): Promise<ComprobanteFiscal | undefined> {
      return db.get<ComprobanteFiscal>(
        `SELECT ${COLS} FROM comprobante_fiscal WHERE compra_id=? AND deleted_at IS NULL`,
        [compraId],
      );
    },

    async listarPendientes(): Promise<ComprobanteFiscal[]> {
      return db.all<ComprobanteFiscal>(
        `SELECT ${COLS} FROM comprobante_fiscal
          WHERE estado_dgii='pendiente' AND deleted_at IS NULL ORDER BY fecha_emision`,
      );
    },

    /** Lo que requiere atención: en validación, rechazados por la DGII o entrega al comprador fallida. */
    async listarParaRevision(): Promise<ComprobanteFiscal[]> {
      return db.all<ComprobanteFiscal>(
        `SELECT ${COLS} FROM comprobante_fiscal
          WHERE (estado_dgii IN ('pendiente','rechazado') OR entrega_estado='rechazado') AND deleted_at IS NULL
          ORDER BY fecha_emision DESC LIMIT 200`,
      );
    },

    /** Aceptados por la DGII cuya entrega al comprador electrónico sigue pendiente. */
    async listarPorEntregar(): Promise<ComprobanteFiscal[]> {
      return db.all<ComprobanteFiscal>(
        `SELECT ${COLS} FROM comprobante_fiscal
          WHERE entrega_estado='pendiente' AND estado_dgii IN ('aceptado','aceptado_condicional')
            AND deleted_at IS NULL ORDER BY fecha_emision`,
      );
    },

    async registrarEntrega(
      id: string,
      estado: EstadoEntrega,
      detalle: string | null,
      acuseXml: string | null,
    ): Promise<void> {
      await db.run(
        "UPDATE comprobante_fiscal SET entrega_estado=?, entrega_detalle=?, acuse_recibo_xml=?, updated_at=? WHERE id=?",
        [estado, detalle, acuseXml, now(), id],
      );
    },

    async actualizarEstado(id: string, estado: EstadoDgii, motivoRechazo: string | null = null): Promise<void> {
      await db.run("UPDATE comprobante_fiscal SET estado_dgii=?, motivo_rechazo=?, updated_at=? WHERE id=?", [
        estado,
        motivoRechazo,
        now(),
        id,
      ]);
    },
  };
}

export type ComprobanteFiscalRepo = ReturnType<typeof crearComprobanteFiscalRepo>;
