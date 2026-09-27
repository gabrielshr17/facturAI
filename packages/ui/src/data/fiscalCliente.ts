import type {
  DatosEntrega,
  EstadoTransmision,
  ProveedorFiscal,
  RangoNcf,
  ResultadoEntrega,
  ResultadoTransmision,
} from "@sfr/core";
import type { ApiClient } from "./apiClient.js";

const variables = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export type ModoFiscal = "simulado" | "dgii";

export const MODO_FISCAL: ModoFiscal = variables.VITE_FISCAL_MODO === "dgii" ? "dgii" : "simulado";

export interface EstadoServicioFiscal {
  disponible: boolean;
  ambiente: "testecf" | "certecf" | "ecf";
  motivo?: string;
  rncEmisor?: string;
  certificadoVence?: string;
}

export function crearProveedorFiscalHttp(api: ApiClient): ProveedorFiscal {
  return {
    transmitir: (comprobante) => api.post<ResultadoTransmision>("/fiscal/comprobantes", comprobante),
  };
}

export function consultarEstadoComprobante(
  api: ApiClient,
  trackId: string,
): Promise<{ estado: EstadoTransmision; motivoRechazo?: string }> {
  return api.get(`/fiscal/comprobantes/${encodeURIComponent(trackId)}`);
}

export function anularRangosNcf(
  api: ApiClient,
  rncEmisor: string,
  rangos: RangoNcf[],
): Promise<{ aceptada: boolean; mensajes: string[] }> {
  return api.post("/fiscal/anulaciones", { rncEmisor, rangos });
}

export function obtenerEstadoServicioFiscal(api: ApiClient): Promise<EstadoServicioFiscal> {
  return api.get("/fiscal/estado");
}

export function entregarAComprador(api: ApiClient, datos: DatosEntrega): Promise<ResultadoEntrega> {
  return api.post("/fiscal/entregas", datos);
}

export async function consultarTrackIdsEcf(
  api: ApiClient,
  encf: string,
): Promise<{ trackId: string; estado: string }[]> {
  const { trackIds } = await api.get<{ trackIds: { trackId: string; estado: string }[] }>(
    `/fiscal/trackids/${encodeURIComponent(encf)}`,
  );
  return trackIds;
}
