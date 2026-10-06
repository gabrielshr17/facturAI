import { google } from "googleapis";
import { cargarConfig } from "../config.js";

/**
 * Cliente de solo lectura (+ marcar como leído) contra el Gmail configurado en `GMAIL_OAUTH_*`
 * (§ Últimas transferencias recibidas, plan.md). Puede ser una casilla 100% dedicada o el Gmail
 * personal real del usuario con un alias "+" como destino del reenvío desde Outlook — por eso
 * `listarCorreosNoLeidos` SIEMPRE filtra por `gmailEtiquetaTransferencias` (default "Transferencias")
 * además de `is:unread`: si apuntara a una cuenta personal y solo mirara "no leído", procesaría (y
 * marcaría como leído) cualquier correo personal no relacionado. El usuario crea un filtro en Gmail
 * que le ponga esa etiqueta a lo que llega de/para el banco (ver README.md).
 */
export interface CorreoTransferencia {
  /** id del mensaje en Gmail, usado también como clave de idempotencia al marcarlo procesado. */
  id: string;
  asunto: string;
  cuerpoTexto: string;
}

export function gmailDisponible(): boolean {
  return cargarConfig().gmailConfigurado;
}

function obtenerCliente() {
  const config = cargarConfig();
  if (!config.gmailConfigurado) {
    throw new Error("Gmail no configurado: falta GMAIL_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN.");
  }
  const auth = new google.auth.OAuth2(config.gmailOAuthClientId ?? undefined, config.gmailOAuthClientSecret ?? undefined);
  auth.setCredentials({ refresh_token: config.gmailOAuthRefreshToken });
  return google.gmail({ version: "v1", auth });
}

export function decodificarBase64Url(datos: string): string {
  return Buffer.from(datos, "base64url").toString("utf-8");
}

interface ParteMensaje {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: ParteMensaje[] | null;
}

/** Recorre las partes MIME buscando texto plano en todo el árbol; solo si no hay, cae a HTML sin las etiquetas. Exportado para los tests. */
export function extraerCuerpo(parte: ParteMensaje | undefined): string {
  const texto = extraerTipo(parte, "text/plain");
  if (texto) return texto;
  return extraerTipo(parte, "text/html").replace(/<[^>]+>/g, " ");
}

function extraerTipo(parte: ParteMensaje | undefined, tipo: string): string {
  if (!parte) return "";
  if (parte.mimeType === tipo && parte.body?.data) {
    return decodificarBase64Url(parte.body.data);
  }
  if (parte.parts) {
    for (const hija of parte.parts) {
      const texto = extraerTipo(hija, tipo);
      if (texto) return texto;
    }
  }
  return "";
}

/**
 * Mensajes no leídos con la etiqueta de transferencias. "No leído" hace de marca de "no procesado
 * todavía" — no hace falta llevar un cursor/estado aparte: `marcarComoProcesado` los quita de esta
 * lista en cuanto se guardan con éxito en `notificacion_transferencia`.
 */
export async function listarCorreosNoLeidos(): Promise<CorreoTransferencia[]> {
  const gmail = obtenerCliente();
  const etiqueta = cargarConfig().gmailEtiquetaTransferencias;
  const lista = await gmail.users.messages.list({
    userId: "me",
    q: `is:unread label:"${etiqueta}"`,
    maxResults: 20,
  });
  const resultados: CorreoTransferencia[] = [];
  for (const referencia of lista.data.messages ?? []) {
    if (!referencia.id) continue;
    const detalle = await gmail.users.messages.get({ userId: "me", id: referencia.id, format: "full" });
    const encabezados = detalle.data.payload?.headers ?? [];
    const asunto = encabezados.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "(sin asunto)";
    resultados.push({
      id: referencia.id,
      asunto,
      cuerpoTexto: extraerCuerpo(detalle.data.payload ?? undefined).trim(),
    });
  }
  return resultados;
}

export async function marcarComoProcesado(id: string): Promise<void> {
  const gmail = obtenerCliente();
  await gmail.users.messages.modify({ userId: "me", id, requestBody: { removeLabelIds: ["UNREAD"] } });
}
