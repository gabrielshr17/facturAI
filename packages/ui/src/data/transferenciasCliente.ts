/**
 * Cliente HTTP de "Últimas transferencias recibidas" (§ plan.md). Habla con `@sfr/api`, igual
 * que `chatbotCliente.ts` — opcional y solo del lado de la nube, requiere sesión iniciada
 * (`Authorization: Bearer <accessToken>`, ver `contexto/Auth.tsx`).
 */
const BASE_URL =
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ?? "http://localhost:3001";

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

async function leerError(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: string };
    if (cuerpo.error) return cuerpo.error;
  } catch {
    // el cuerpo no era JSON; caemos al mensaje genérico de abajo
  }
  return `El servidor respondió con un error (${respuesta.status}).`;
}

function envolverErrorDeRed(e: unknown): never {
  if (e instanceof TypeError) {
    throw new Error(
      "No se pudo conectar con el servidor. Verifica tu conexión y que el backend (packages/api) esté " +
        "corriendo en " +
        BASE_URL +
        ".",
    );
  }
  throw e instanceof Error ? e : new Error(String(e));
}

export async function obtenerTransferenciasRecientes(accessToken: string): Promise<NotificacionTransferencia[]> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE_URL}/transferencias/recientes`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    envolverErrorDeRed(e);
  }
  if (!respuesta.ok) throw new Error(await leerError(respuesta));
  const cuerpo = (await respuesta.json()) as { transferencias: NotificacionTransferencia[] };
  return cuerpo.transferencias;
}

async function cambiarEstado(
  accessToken: string,
  id: string,
  accion: "confirmar" | "descartar",
): Promise<NotificacionTransferencia> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE_URL}/transferencias/${id}/${accion}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    envolverErrorDeRed(e);
  }
  if (!respuesta.ok) throw new Error(await leerError(respuesta));
  const cuerpo = (await respuesta.json()) as { transferencia: NotificacionTransferencia };
  return cuerpo.transferencia;
}

export function confirmarTransferencia(accessToken: string, id: string): Promise<NotificacionTransferencia> {
  return cambiarEstado(accessToken, id, "confirmar");
}

export function descartarTransferencia(accessToken: string, id: string): Promise<NotificacionTransferencia> {
  return cambiarEstado(accessToken, id, "descartar");
}
