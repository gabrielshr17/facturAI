import type { SupabaseClient } from "@supabase/supabase-js";
import type { EcfRecibido } from "../verificacion.js";

export interface EcfRecibidoGuardado extends EcfRecibido {
  xml: string;
  acuseXml: string;
}

export interface AprobacionRecibida {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  aprobado: boolean;
  motivo: string | null;
  xml: string;
}

/** Persistencia de lo que otros contribuyentes nos envían (§ servicios de recepción DGII). */
export interface AlmacenRecepcion {
  guardarEcf(ecf: EcfRecibidoGuardado): Promise<"nuevo" | "duplicado">;
  guardarAprobacion(aprobacion: AprobacionRecibida): Promise<void>;
}

const VIOLACION_UNICIDAD = "23505";

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
  };
}
