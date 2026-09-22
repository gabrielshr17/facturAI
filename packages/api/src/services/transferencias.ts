import { randomUUID } from "node:crypto";
import { obtenerClienteDb } from "./db.js";
import { gmailDisponible, listarCorreosNoLeidos, marcarComoProcesado } from "./gmail.js";
import { geminiDisponible, extraerTransferencia } from "./gemini.js";

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

/** false si falta Gmail o Gemini: el poller y `GET /transferencias/recientes` lo usan para
 *  degradar con un mensaje explícito en vez de fallar sin explicación. */
export function transferenciasDisponible(): boolean {
  return gmailDisponible() && geminiDisponible();
}

const LARGO_SNIPPET = 500;

/**
 * Un ciclo de sondeo: lee los correos no leídos de la casilla dedicada, le pide a Gemini que
 * extraiga los datos de cada uno, guarda una fila `pendiente` por correo, y recién entonces lo
 * marca como leído — si `extraerTransferencia` o el insert fallan, el correo queda sin marcar y
 * se reintenta en el próximo ciclo en vez de perderse.
 */
export async function sincronizarTransferencias(): Promise<number> {
  if (!transferenciasDisponible()) return 0;

  const correos = await listarCorreosNoLeidos();
  const db = obtenerClienteDb();
  let procesados = 0;

  for (const correo of correos) {
    try {
      const datos = await extraerTransferencia(correo.asunto, correo.cuerpoTexto);
      const { error } = await db.from("notificacion_transferencia").insert({
        id: randomUUID(),
        monto: datos.monto,
        fecha: datos.fecha,
        banco_origen: datos.bancoOrigen,
        remitente: datos.remitente,
        referencia: datos.referencia,
        correo_snippet: correo.cuerpoTexto.slice(0, LARGO_SNIPPET),
        estado_confirmacion: "pendiente",
        identificado_por: "chatbot",
        datos_extraidos_json: datos,
      });
      if (error) throw new Error(error.message);
      await marcarComoProcesado(correo.id);
      procesados++;
    } catch (e) {
      console.error(`No se pudo procesar el correo de transferencia ${correo.id}:`, e);
    }
  }
  return procesados;
}

export async function listarRecientes(limite = 30): Promise<NotificacionTransferencia[]> {
  const db = obtenerClienteDb();
  const { data, error } = await db
    .from("notificacion_transferencia")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []).map(aNotificacion);
}

/** null si el id no existe (o ya estaba borrado) — la ruta lo traduce a 404. */
export async function actualizarEstado(
  id: string,
  estado: "confirmada" | "descartada",
): Promise<NotificacionTransferencia | null> {
  const db = obtenerClienteDb();
  const { data, error } = await db
    .from("notificacion_transferencia")
    .update({ estado_confirmacion: estado, updated_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aNotificacion(data) : null;
}

function aNotificacion(fila: Record<string, unknown>): NotificacionTransferencia {
  return {
    id: fila.id as string,
    monto: (fila.monto as number | string | null) !== null ? Number(fila.monto) : null,
    fecha: fila.fecha as string | null,
    bancoOrigen: fila.banco_origen as string | null,
    remitente: fila.remitente as string | null,
    referencia: fila.referencia as string | null,
    correoSnippet: fila.correo_snippet as string,
    estadoConfirmacion: fila.estado_confirmacion as EstadoConfirmacion,
    identificadoPor: fila.identificado_por as "chatbot" | "usuario",
    createdAt: fila.created_at as string,
  };
}
