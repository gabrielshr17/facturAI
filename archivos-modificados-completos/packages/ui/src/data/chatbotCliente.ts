import type { ApiClient } from "./apiClient.js";

/**
 * Cliente del chatbot (§ Fase 3: chatbot con voz y visión) sobre el backend `@sfr/api`, que es
 * opcional: si no está corriendo o le falta `ANTHROPIC_API_KEY`, `ApiClient` lanza un error con un
 * mensaje claro para mostrar en la UI.
 */
export interface MensajeChat {
  rol: "user" | "assistant";
  texto: string;
}

export interface ImagenAdjunta {
  /** Base64 sin el prefijo "data:...;base64,". */
  data: string;
  tipoMime: string;
}

export interface DatosExtraidosComprobante {
  proveedor: string | null;
  rnc: string | null;
  ncf: string | null;
  fecha: string | null;
  monto: number | null;
  itbis: number | null;
  clasificacion: "con_fiscal" | "sin_fiscal" | "pendiente_revision";
  confianza: "alta" | "media" | "baja";
  notas: string | null;
}

export async function enviarMensaje(
  api: ApiClient,
  historial: MensajeChat[],
  mensaje: string,
  imagen?: ImagenAdjunta,
): Promise<string> {
  const { respuesta } = await api.post<{ respuesta: string }>("/chatbot/mensaje", { historial, mensaje, imagen });
  return respuesta;
}

export async function analizarComprobante(api: ApiClient, imagen: ImagenAdjunta): Promise<DatosExtraidosComprobante> {
  const { datos } = await api.post<{ datos: DatosExtraidosComprobante }>("/chatbot/analizar-comprobante", { imagen });
  return datos;
}
