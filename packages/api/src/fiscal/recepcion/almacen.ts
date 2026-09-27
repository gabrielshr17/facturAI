import type { SupabaseClient } from "@supabase/supabase-js";
import type { EcfRecibido } from "../verificacion.js";

export interface EcfRecibidoGuardado extends EcfRecibido {
  xml: string;
  acuseXml: string;
}

export type EstadoAprobacion = "pendiente" | "aprobado" | "rechazado";

export interface FilaEcfRecibido extends EcfRecibido {
  id: string;
  estadoAprobacion: EstadoAprobacion;
  motivoAprobacion: string | null;
  aprobacionEnviadaAt: string | null;
  importadoAt: string | null;
  recibidoAt: string;
}

export interface AprobacionRecibida {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  aprobado: boolean;
  motivo: string | null;
  xml: string;
}

export interface AprobacionEmitida {
  aprobado: boolean;
  motivo: string | null;
  xml: string;
  enviadaAt: string;
}

/** Persistencia de lo que otros contribuyentes nos envían (§ servicios de recepción DGII). */
export interface AlmacenRecepcion {
  guardarEcf(ecf: EcfRecibidoGuardado): Promise<"nuevo" | "duplicado">;
  guardarAprobacion(aprobacion: AprobacionRecibida): Promise<void>;
  listarEcfRecibidos(): Promise<FilaEcfRecibido[]>;
  obtenerEcfRecibido(id: string): Promise<FilaEcfRecibido | null>;
  obtenerXmlEcfRecibido(id: string): Promise<string | null>;
  registrarAprobacionEmitida(id: string, aprobacion: AprobacionEmitida): Promise<void>;
  marcarImportado(id: string, fecha: string): Promise<void>;
}

const VIOLACION_UNICIDAD = "23505";

const COLUMNAS_FILA =
  "id, tipo_ecf, encf, rnc_emisor, razon_social_emisor, rnc_comprador, fecha_emision, monto_total, " +
  "total_itbis, estado_aprobacion, motivo_aprobacion, aprobacion_enviada_at, importado_at, created_at";

interface FilaSupabase {
  id: string;
  tipo_ecf: string;
  encf: string;
  rnc_emisor: string;
  razon_social_emisor: string;
  rnc_comprador: string | null;
  fecha_emision: string;
  monto_total: number | string;
  total_itbis: number | string;
  estado_aprobacion: EstadoAprobacion;
  motivo_aprobacion: string | null;
  aprobacion_enviada_at: string | null;
  importado_at: string | null;
  created_at: string;
}

function aFila(f: FilaSupabase): FilaEcfRecibido {
  return {
    id: f.id,
    tipoEcf: f.tipo_ecf,
    encf: f.encf,
    rncEmisor: f.rnc_emisor,
    razonSocialEmisor: f.razon_social_emisor,
    rncComprador: f.rnc_comprador,
    fechaEmision: f.fecha_emision,
    montoTotal: Number(f.monto_total),
    totalItbis: Number(f.total_itbis),
    estadoAprobacion: f.estado_aprobacion,
    motivoAprobacion: f.motivo_aprobacion,
    aprobacionEnviadaAt: f.aprobacion_enviada_at,
    importadoAt: f.importado_at,
    recibidoAt: f.created_at,
  };
}

export function crearAlmacenSupabase(db: SupabaseClient): AlmacenRecepcion {
  return {
    async guardarEcf(ecf) {
      const { error } = await db.from("ecf_recibido").insert({
        tipo_ecf: ecf.tipoEcf,
        encf: ecf.encf,
        rnc_emisor: ecf.rncEmisor,
        razon_social_emisor: ecf.razonSocialEmisor,
        rnc_comprador: ecf.rncComprador,
        fecha_emision: ecf.fechaEmision,
        monto_total: ecf.montoTotal,
        total_itbis: ecf.totalItbis,
        xml: ecf.xml,
        acuse_xml: ecf.acuseXml,
      });
      if (error?.code === VIOLACION_UNICIDAD) return "duplicado";
      if (error) throw new Error(`No se pudo guardar el e-CF recibido: ${error.message}`);
      return "nuevo";
    },

    async guardarAprobacion(aprobacion) {
      const { error } = await db.from("aprobacion_comercial_recibida").insert({
        rnc_emisor: aprobacion.rncEmisor,
        rnc_comprador: aprobacion.rncComprador,
        encf: aprobacion.encf,
        aprobado: aprobacion.aprobado,
        motivo: aprobacion.motivo,
        xml: aprobacion.xml,
      });
      if (error) throw new Error(`No se pudo guardar la aprobación comercial: ${error.message}`);
    },

    async listarEcfRecibidos() {
      const { data, error } = await db
        .from("ecf_recibido")
        .select(COLUMNAS_FILA)
        .order("created_at", { ascending: false })
        .limit(500)
        .overrideTypes<FilaSupabase[], { merge: false }>();
      if (error) throw new Error(`No se pudieron listar los e-CF recibidos: ${error.message}`);
      return data.map(aFila);
    },

    async obtenerEcfRecibido(id) {
      const { data, error } = await db
        .from("ecf_recibido")
        .select(COLUMNAS_FILA)
        .eq("id", id)
        .maybeSingle()
        .overrideTypes<FilaSupabase | null, { merge: false }>();
      if (error) throw new Error(`No se pudo leer el e-CF recibido: ${error.message}`);
      return data ? aFila(data) : null;
    },

    async obtenerXmlEcfRecibido(id) {
      const { data, error } = await db
        .from("ecf_recibido")
        .select("xml")
        .eq("id", id)
        .maybeSingle()
        .overrideTypes<{ xml: string } | null, { merge: false }>();
      if (error) throw new Error(`No se pudo leer el XML del e-CF recibido: ${error.message}`);
      return data?.xml ?? null;
    },

    async registrarAprobacionEmitida(id, aprobacion) {
      const { error } = await db
        .from("ecf_recibido")
        .update({
          estado_aprobacion: aprobacion.aprobado ? "aprobado" : "rechazado",
          motivo_aprobacion: aprobacion.motivo,
          aprobacion_xml: aprobacion.xml,
          aprobacion_enviada_at: aprobacion.enviadaAt,
        })
        .eq("id", id);
      if (error) throw new Error(`No se pudo registrar la aprobación emitida: ${error.message}`);
    },

    async marcarImportado(id, fecha) {
      const { error } = await db.from("ecf_recibido").update({ importado_at: fecha }).eq("id", id);
      if (error) throw new Error(`No se pudo marcar el e-CF como importado: ${error.message}`);
    },
  };
}
