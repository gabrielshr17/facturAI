import type { FastifyPluginAsync } from "fastify";
import { claudeDisponible, enviarMensaje, analizarComprobante, type MensajeChat, type ImagenAdjunta } from "../services/claude.js";

interface CuerpoMensaje {
  historial?: MensajeChat[];
  mensaje: string;
  imagen?: ImagenAdjunta;
}

interface CuerpoAnalizar {
  imagen: ImagenAdjunta;
}

/**
 * Chatbot con voz y visión (§ Fase 3). Requiere ANTHROPIC_API_KEY configurada
 * en el backend — sin ella, responde 501 explícito. La voz se maneja en el
 * cliente (Web Speech API del navegador, sin backend); estas rutas solo
 * cubren la parte de texto/visión que sí necesita un modelo.
 */
export const rutaChatbot: FastifyPluginAsync = async (app) => {
  app.post<{ Body: CuerpoMensaje }>("/chatbot/mensaje", async (request, reply) => {
    if (!claudeDisponible()) {
      await reply.code(501).send({ error: "El asistente no está configurado: falta ANTHROPIC_API_KEY en el backend." });
      return;
    }
    const { historial = [], mensaje, imagen } = request.body;
    if (!mensaje?.trim() && !imagen) {
      await reply.code(400).send({ error: "Escribe un mensaje o adjunta una imagen." });
      return;
    }
    try {
      const respuesta = await enviarMensaje(historial, mensaje ?? "", imagen);
      return { respuesta };
    } catch (e) {
      app.log.error(e);
      await reply.code(502).send({ error: "No se pudo contactar al asistente. Intenta de nuevo." });
    }
  });

  app.post<{ Body: CuerpoAnalizar }>("/chatbot/analizar-comprobante", async (request, reply) => {
    if (!claudeDisponible()) {
      await reply.code(501).send({ error: "El análisis de comprobantes no está configurado: falta ANTHROPIC_API_KEY en el backend." });
      return;
    }
    if (!request.body?.imagen) {
      await reply.code(400).send({ error: "Adjunta una imagen del comprobante." });
      return;
    }
    try {
      const datos = await analizarComprobante(request.body.imagen);
      return { datos };
    } catch (e) {
      app.log.error(e);
      await reply.code(502).send({ error: "No se pudo analizar la imagen. Intenta de nuevo o ingresa los datos manualmente." });
    }
  });
};
