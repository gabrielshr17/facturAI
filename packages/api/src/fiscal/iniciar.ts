import { readFileSync } from "node:fs";
import type { ConfigApi } from "../config.js";
import type { AmbienteDgii } from "./ambiente.js";
import { cargarCertificado } from "./firma.js";
import { crearClienteDgii } from "./dgii-cliente.js";
import { crearServicioEmision, type ServicioEmision } from "./servicio-emision.js";

export type ModuloFiscal =
  | { disponible: true; ambiente: AmbienteDgii; certificadoVence: Date; servicio: ServicioEmision }
  | { disponible: false; ambiente: AmbienteDgii; motivo: string };

export function iniciarModuloFiscal(config: ConfigApi): ModuloFiscal {
  const ambiente = config.dgiiAmbiente;
  if (!config.dgiiP12Ruta || !config.dgiiP12Clave) {
    return { disponible: false, ambiente, motivo: "Falta configurar DGII_P12_PATH y DGII_P12_PASSWORD." };
  }
  try {
    const certificado = cargarCertificado(readFileSync(config.dgiiP12Ruta), config.dgiiP12Clave);
    if (certificado.venceEl.getTime() < Date.now()) {
      return {
        disponible: false,
        ambiente,
        motivo: `El certificado digital venció el ${certificado.venceEl.toISOString()}.`,
      };
    }
    const cliente = crearClienteDgii({ ambiente, certificado });
    return {
      disponible: true,
      ambiente,
      certificadoVence: certificado.venceEl,
      servicio: crearServicioEmision({ ambiente, certificado, cliente }),
    };
  } catch (error) {
    return {
      disponible: false,
      ambiente,
      motivo: `No se pudo cargar el certificado digital: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
