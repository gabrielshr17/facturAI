import type { ApiClient } from "./apiClient.js";

/**
 * Cliente de "Últimas transferencias recibidas" (§ plan.md) sobre el backend `@sfr/api`: opcional
 * y solo del lado de la nube; requiere sesión iniciada o la llave de la caja (ver `apiClient`).
 */
export type EstadoConfirmacion = "pendiente" | "confirmada" | "descartada";

export interface NotificacionTransferencia {
  id: string;
  monto: number | null;
  fecha: string | null;
  bancoOrigen: string | null;
  remitente: string | null;
  referencia: string | null;
  correoSnippet: string;
  estadoConfirmacion: EstadoConfirmacion;
  identificadoPor: "chatbot" | "usuario";
  createdAt: string;
}

export async function obtenerTransferenciasRecientes(api: ApiClient): Promise<NotificacionTransferencia[]> {
  const { transferencias } = await api.get<{ transferencias: NotificacionTransferencia[] }>(
    "/transferencias/recientes",
  );
  return transferencias;
}

async function cambiarEstado(
  api: ApiClient,
  id: string,
  accion: "confirmar" | "descartar",
): Promise<NotificacionTransferencia> {
  const { transferencia } = await api.patch<{ transferencia: NotificacionTransferencia }>(
    `/transferencias/${encodeURIComponent(id)}/${accion}`,
  );
  return transferencia;
}

export function confirmarTransferencia(api: ApiClient, id: string): Promise<NotificacionTransferencia> {
  return cambiarEstado(api, id, "confirmar");
}

export function descartarTransferencia(api: ApiClient, id: string): Promise<NotificacionTransferencia> {
  return cambiarEstado(api, id, "descartar");
}
