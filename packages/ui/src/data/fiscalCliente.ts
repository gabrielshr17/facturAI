import type {
  DatosEntrega,
  ImpuestoTipo,
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

export interface EcfRecibidoResumen {
  id: string;
  tipoEcf: string;
  encf: string;
  rncEmisor: string;
  razonSocialEmisor: string;
  fechaEmision: string;
  montoTotal: number;
  totalItbis: number;
  estadoAprobacion: "pendiente" | "aprobado" | "rechazado";
  motivoAprobacion: string | null;
  importadoAt: string | null;
  recibidoAt: string;
}

export interface ItemEcfRecibido {
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  impuestoTipo: ImpuestoTipo;
  tasaImpuesto: number;
}

export interface ResultadoRespuestaComercial {
  dgii: { aceptada: boolean; mensajes: string[] };
  emisor: { entregada: true } | { entregada: false; detalle: string };
}

export async function listarEcfRecibidos(api: ApiClient): Promise<EcfRecibidoResumen[]> {
  const { recibidos } = await api.get<{ recibidos: EcfRecibidoResumen[] }>("/fiscal/recibidos");
  return recibidos;
}

export function detalleEcfRecibido(
  api: ApiClient,
  id: string,
): Promise<{ recibido: EcfRecibidoResumen; items: ItemEcfRecibido[] }> {
  return api.get(`/fiscal/recibidos/${encodeURIComponent(id)}`);
}

export function responderEcfRecibido(
  api: ApiClient,
  id: string,
  respuesta: { aprobado: boolean; motivo?: string },
): Promise<ResultadoRespuestaComercial> {
  return api.post(`/fiscal/recibidos/${encodeURIComponent(id)}/respuesta`, respuesta);
}

export async function marcarEcfRecibidoImportado(api: ApiClient, id: string): Promise<void> {
  await api.post(`/fiscal/recibidos/${encodeURIComponent(id)}/importado`, {});
}
