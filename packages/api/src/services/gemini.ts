import { GoogleGenAI, Type } from "@google/genai";

/**
 * Integración con Gemini, usada solo para extraer datos de correos de
 * notificación bancaria (§ Últimas transferencias recibidas). El chatbot de
 * comprobantes sigue en Claude (`services/claude.ts`) — no relacionado.
 */
export function geminiDisponible(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

let cliente: GoogleGenAI | null = null;

function obtenerCliente(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no configurada.");
  }
  if (!cliente) {
    cliente = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return cliente;
}

const MODELO = "gemini-2.5-flash";

export interface DatosExtraidosTransferencia {
  monto: number | null;
  fecha: string | null;
  bancoOrigen: string | null;
  remitente: string | null;
  referencia: string | null;
  confianza: "alta" | "media" | "baja";
  notas: string | null;
}

const ESQUEMA_TRANSFERENCIA = {
  type: Type.OBJECT,
  properties: {
    monto: { type: Type.NUMBER, nullable: true, description: "Monto de la transferencia, o null si no se lee." },
    fecha: { type: Type.STRING, nullable: true, description: "Fecha de la transferencia en formato AAAA-MM-DD, o null." },
    bancoOrigen: { type: Type.STRING, nullable: true, description: "Banco que envía la notificación, o null." },
    remitente: { type: Type.STRING, nullable: true, description: "Nombre de quien envió la transferencia, o null." },
    referencia: { type: Type.STRING, nullable: true, description: "Número de referencia/confirmación, o null." },
    confianza: { type: Type.STRING, enum: ["alta", "media", "baja"], description: "Qué tan seguro estás de la lectura." },
    notas: { type: Type.STRING, nullable: true, description: "Cualquier duda o algo que la persona debería revisar." },
  },
  required: ["monto", "fecha", "bancoOrigen", "remitente", "referencia", "confianza", "notas"],
};

const PROMPT_SISTEMA_TRANSFERENCIA = `Analizas el texto de correos de notificación bancaria (República Dominicana)
que avisan que una transferencia fue recibida en la cuenta del negocio.
Extrae monto, fecha, banco origen, remitente y referencia. Si algo no
aparece con claridad en el texto, dilo en "notas" y baja la confianza —
NUNCA inventes un dato que no está en el correo.`;

/**
 * Extrae los datos de un correo de notificación bancaria (§ Últimas
 * transferencias recibidas). SIEMPRE debe confirmarse/descartarse a mano
 * desde la app antes de darlo por bueno — este servicio solo lee.
 */
export async function extraerTransferencia(asunto: string, cuerpo: string): Promise<DatosExtraidosTransferencia> {
  const genai = obtenerCliente();

  const respuesta = await genai.models.generateContent({
    model: MODELO,
    contents: `Asunto: ${asunto}\n\nCuerpo:\n${cuerpo}`,
    config: {
      systemInstruction: PROMPT_SISTEMA_TRANSFERENCIA,
      responseMimeType: "application/json",
      responseSchema: ESQUEMA_TRANSFERENCIA,
    },
  });

  const texto = respuesta.text;
  if (!texto) {
    throw new Error("Gemini no devolvió los datos extraídos.");
  }
  return JSON.parse(texto) as DatosExtraidosTransferencia;
}
