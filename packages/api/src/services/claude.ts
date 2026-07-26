import Anthropic from "@anthropic-ai/sdk";

/**
 * Integración con Claude (§ Fase 3: chatbot con voz y visión). Real, no un
 * stub — pero gated por `ANTHROPIC_API_KEY`: sin la variable de entorno,
 * `claudeDisponible()` es false y las rutas que la usan devuelven un error
 * claro en vez de intentar (y fallar) la llamada.
 */
export function claudeDisponible(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cliente: Anthropic | null = null;

function obtenerCliente(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY no configurada.");
  }
  if (!cliente) {
    cliente = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return cliente;
}

const MODELO = "claude-sonnet-5";

export interface MensajeChat {
  rol: "user" | "assistant";
  texto: string;
}

export interface ImagenAdjunta {
  /** Base64 sin el prefijo "data:...;base64,". */
  data: string;
  tipoMime: string;
}

const PROMPT_SISTEMA_CHAT = `Eres el asistente del Sistema de Facturación (República Dominicana), integrado en
la pantalla de Ventas. Ayudas al cajero con preguntas sobre productos, precios,
clientes y el funcionamiento del sistema. NO tienes acceso directo a la base de
datos — si te preguntan algo específico de inventario/precios que no está en la
conversación, pide que lo consulten en la pantalla correspondiente. Responde en
español, corto y directo (es un punto de venta, no hay tiempo para párrafos).`;

/** Conversación de texto (+ opcionalmente una imagen adjunta en el último turno). */
export async function enviarMensaje(historial: MensajeChat[], mensaje: string, imagen?: ImagenAdjunta): Promise<string> {
  const anthropic = obtenerCliente();

  const mensajesPrevios: Anthropic.MessageParam[] = historial.map((m) => ({
    role: m.rol === "user" ? "user" : "assistant",
    content: m.texto,
  }));

  const contenidoActual: Anthropic.ContentBlockParam[] = [];
  if (imagen) {
    contenidoActual.push({
      type: "image",
      source: { type: "base64", media_type: imagen.tipoMime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imagen.data },
    });
  }
  contenidoActual.push({ type: "text", text: mensaje });

  const respuesta = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 512,
    system: PROMPT_SISTEMA_CHAT,
    messages: [...mensajesPrevios, { role: "user", content: contenidoActual }],
  });

  const bloqueTexto = respuesta.content.find((b) => b.type === "text");
  return bloqueTexto && bloqueTexto.type === "text" ? bloqueTexto.text : "";
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

const HERRAMIENTA_EXTRAER: Anthropic.Tool = {
  name: "extraer_datos_factura",
  description: "Registra los datos extraídos de la foto de una factura/recibo de compra dominicano.",
  input_schema: {
    type: "object",
    properties: {
      proveedor: { type: ["string", "null"], description: "Nombre del proveedor/comercio, o null si no se lee." },
      rnc: { type: ["string", "null"], description: "RNC del proveedor (9 u 11 dígitos), o null." },
      ncf: { type: ["string", "null"], description: "NCF o e-CF del comprobante, o null si no tiene." },
      fecha: { type: ["string", "null"], description: "Fecha del comprobante en formato AAAA-MM-DD, o null." },
      monto: { type: ["number", "null"], description: "Monto total de la factura, o null." },
      itbis: { type: ["number", "null"], description: "Monto de ITBIS, o null si no se distingue." },
      clasificacion: { type: "string", enum: ["con_fiscal", "sin_fiscal", "pendiente_revision"] },
      confianza: { type: "string", enum: ["alta", "media", "baja"], description: "Qué tan seguro estás de la lectura." },
      notas: { type: ["string", "null"], description: "Cualquier duda o algo que el usuario debería revisar." },
    },
    required: ["proveedor", "rnc", "ncf", "fecha", "monto", "itbis", "clasificacion", "confianza", "notas"],
  },
};

const PROMPT_SISTEMA_VISION = `Analizas fotos de facturas/recibos de compra para un colmado/negocio pequeño en
República Dominicana. Extrae proveedor, RNC, NCF (si existe), fecha, monto
total e ITBIS. Clasifica como 'con_fiscal' si tiene NCF/e-CF válido,
'sin_fiscal' si es un recibo simple sin NCF, o 'pendiente_revision' si no
estás seguro. Si algo no se lee con claridad, dilo en "notas" y baja la
confianza — NUNCA inventes un dato que no se ve en la imagen. Usa siempre
la herramienta extraer_datos_factura para responder.`;

/**
 * Extrae datos de una foto de comprobante de compra. SIEMPRE debe mostrarse
 * al usuario para confirmar antes de guardar nada (requisito de seguridad,
 * plan.md sección 8) — este servicio solo lee, nunca escribe.
 */
export async function analizarComprobante(imagen: ImagenAdjunta): Promise<DatosExtraidosComprobante> {
  const anthropic = obtenerCliente();

  const respuesta = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 1024,
    system: PROMPT_SISTEMA_VISION,
    tools: [HERRAMIENTA_EXTRAER],
    tool_choice: { type: "tool", name: "extraer_datos_factura" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: imagen.tipoMime as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imagen.data },
          },
          { type: "text", text: "Extrae los datos de este comprobante." },
        ],
      },
    ],
  });

  const bloqueHerramienta = respuesta.content.find((b) => b.type === "tool_use");
  if (!bloqueHerramienta || bloqueHerramienta.type !== "tool_use") {
    throw new Error("Claude no devolvió los datos extraídos.");
  }
  return bloqueHerramienta.input as DatosExtraidosComprobante;
}
