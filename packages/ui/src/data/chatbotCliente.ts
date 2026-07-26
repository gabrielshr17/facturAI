/**
 * Cliente HTTP del chatbot (§ Fase 3: chatbot con voz y visión). Habla con
 * el backend `@sfr/api` (packages/api) — que es opcional: si no está
 * corriendo, o si le falta `ANTHROPIC_API_KEY`, estas funciones lanzan un
 * error con un mensaje claro para mostrar en la UI, en vez de fallar en
 * silencio.
 */
const BASE_URL = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_URL ?? "http://localhost:3001";

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

async function leerError(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: string };
    if (cuerpo.error) return cuerpo.error;
  } catch {
    // el cuerpo no era JSON; caemos al mensaje genérico de abajo
  }
  return `El asistente respondió con un error (${respuesta.status}).`;
}

function envolverErrorDeRed(e: unknown): never {
  if (e instanceof TypeError) {
    throw new Error(
      "No se pudo conectar con el asistente. Verifica que el backend (packages/api) esté corriendo en " + BASE_URL + ".",
    );
  }
  throw e instanceof Error ? e : new Error(String(e));
}

export async function enviarMensaje(historial: MensajeChat[], mensaje: string, imagen?: ImagenAdjunta): Promise<string> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE_URL}/chatbot/mensaje`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ historial, mensaje, imagen }),
    });
  } catch (e) {
    envolverErrorDeRed(e);
  }
  if (!respuesta.ok) throw new Error(await leerError(respuesta));
  const cuerpo = (await respuesta.json()) as { respuesta: string };
  return cuerpo.respuesta;
}

export async function analizarComprobante(imagen: ImagenAdjunta): Promise<DatosExtraidosComprobante> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${BASE_URL}/chatbot/analizar-comprobante`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagen }),
    });
  } catch (e) {
    envolverErrorDeRed(e);
  }
  if (!respuesta.ok) throw new Error(await leerError(respuesta));
  const cuerpo = (await respuesta.json()) as { datos: DatosExtraidosComprobante };
  return cuerpo.datos;
}
