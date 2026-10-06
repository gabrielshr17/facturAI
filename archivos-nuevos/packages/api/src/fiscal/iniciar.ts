import { readFileSync } from "node:fs";
import type { ConfigApi } from "../config.js";
import type { AmbienteDgii } from "./ambiente.js";
import { cargarCertificado, firmarXml } from "./firma.js";
import { crearClienteDgii, type ClienteDgii } from "./dgii-cliente.js";
import { crearServicioEntrega, type ServicioEntrega } from "./servicio-entrega.js";
import { crearClienteContribuyente } from "./entrega.js";
import { crearServicioEmision, type ServicioEmision } from "./servicio-emision.js";

export type ModuloFiscal =
  | {
      disponible: true;
      ambiente: AmbienteDgii;
      rncEmisor: string;
      certificadoVence: Date;
      servicio: ServicioEmision;
      firmar: (xml: string) => string;
      dgii: ClienteDgii;
      entrega: ServicioEntrega;
    }
  | { disponible: false; ambiente: AmbienteDgii; motivo: string };

export function iniciarModuloFiscal(config: ConfigApi): ModuloFiscal {
  const ambiente = config.dgiiAmbiente;
  const rncEmisor = config.dgiiRncEmisor;
  if (!rncEmisor) {
    return { disponible: false, ambiente, motivo: "Falta configurar DGII_RNC_EMISOR (RNC de la empresa)." };
  }
  if ((!config.dgiiP12Ruta && !config.dgiiP12Base64) || !config.dgiiP12Clave) {
    return {
      disponible: false,
      ambiente,
      motivo: "Falta configurar DGII_P12_PATH (o DGII_P12_BASE64) y DGII_P12_PASSWORD.",
    };
  }
  try {
    const p12 = config.dgiiP12Ruta
      ? readFileSync(config.dgiiP12Ruta)
      : Buffer.from(config.dgiiP12Base64 ?? "", "base64");
    const certificado = cargarCertificado(p12, config.dgiiP12Clave);
    if (certificado.venceEl.getTime() < Date.now()) {
      return {
        disponible: false,
        ambiente,
        motivo: `El certificado digital venció el ${certificado.venceEl.toISOString()}.`,
      };
    }
    const digitosSn = (certificado.serialSujeto ?? "").replace(/\D/g, "");
    if (!digitosSn.includes(rncEmisor)) {
      return {
        disponible: false,
        ambiente,
        motivo: `El campo SN del certificado (${certificado.serialSujeto ?? "vacío"}) no corresponde al RNC ${rncEmisor}.`,
      };
    }
    const cliente = crearClienteDgii({ ambiente, certificado });
    return {
      disponible: true,
      ambiente,
      rncEmisor,
      certificadoVence: certificado.venceEl,
      servicio: crearServicioEmision({ ambiente, certificado, cliente }),
      firmar: (xml) => firmarXml(xml, certificado),
      dgii: cliente,
      entrega: crearServicioEntrega({
        rncPropio: rncEmisor,
        dgii: cliente,
        contribuyente: crearClienteContribuyente({ firmar: (xml) => firmarXml(xml, certificado) }),
      }),
    };
  } catch (error) {
    return {
      disponible: false,
      ambiente,
      motivo: `No se pudo cargar el certificado digital: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
