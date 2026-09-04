import { useRef, useState } from "react";
import { MessageCircle, Bot, X, Camera } from "lucide-react";
import { enviarMensaje, type MensajeChat } from "../data/chatbotCliente.js";
import { s, c, sombra } from "../estilos.js";
import { BotonVoz } from "./BotonVoz.js";
import { mensajeError } from "../utilidades/errores.js";

function leerArchivoComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Chatbot con voz y visión (§ Fase 3), flotante en la pantalla de Ventas.
 * Habla con el backend `@sfr/api` (opcional) — si no está corriendo o le
 * falta `ANTHROPIC_API_KEY`, muestra el error explicando por qué en vez de
 * fallar en silencio. No guarda nada por sí mismo: es solo conversación.
 */
export function ChatBot() {
  const [abierto, setAbierto] = useState(false);
  const [historial, setHistorial] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState<{ archivo: File; previewUrl: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  function adjuntarImagen(file: File | null) {
    if (!file) { setImagen(null); return; }
    setImagen({ archivo: file, previewUrl: URL.createObjectURL(file) });
  }

  async function enviar() {
    const mensajeTexto = texto.trim();
    if (!mensajeTexto && !imagen) return;
    setError(null);
    setEnviando(true);
    const historialPrevio = historial;
    const nuevoHistorial: MensajeChat[] = [...historialPrevio, { rol: "user", texto: mensajeTexto || "(foto adjunta)" }];
    setHistorial(nuevoHistorial);
    setTexto("");
    const archivoAdjunto = imagen?.archivo ?? null;
    setImagen(null);
    if (inputArchivoRef.current) inputArchivoRef.current.value = "";
    try {
      const imagenAdjunta = archivoAdjunto
        ? { data: await leerArchivoComoBase64(archivoAdjunto), tipoMime: archivoAdjunto.type || "image/jpeg" }
        : undefined;
      const respuesta = await enviarMensaje(historialPrevio, mensajeTexto, imagenAdjunta);
      setHistorial((prev) => [...prev, { rol: "assistant", texto: respuesta }]);
    } catch (e) {
      setError(mensajeError(e));
      setHistorial(historialPrevio);
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 100,
          borderRadius: 999, width: 56, height: 56,
          background: c.azul, color: "white", border: "none", cursor: "pointer",
          boxShadow: sombra.md, display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title="Asistente"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 100,
        width: 340, maxHeight: 480, display: "flex", flexDirection: "column",
        background: "white", borderRadius: 16,
        boxShadow: sombra.md, overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: c.azul, color: "white" }}>
        <strong style={{ display: "flex", alignItems: "center", gap: 6 }}><Bot size={17} /> Asistente</strong>
        <button onClick={() => setAbierto(false)} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: 0, lineHeight: 1, display: "flex" }}><X size={18} /></button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 200 }}>
        {historial.length === 0 && (
          <p style={{ color: c.gris, fontSize: 13, margin: 0 }}>
            Pregúntame sobre productos, precios o el sistema. También puedes adjuntar una foto de un comprobante.
          </p>
        )}
        {historial.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.rol === "user" ? "flex-end" : "flex-start",
            background: m.rol === "user" ? c.azul : c.grisClaro,
            color: m.rol === "user" ? "white" : c.texto,
            padding: "7px 11px", borderRadius: 12, maxWidth: "85%", fontSize: 13, whiteSpace: "pre-wrap",
          }}>
            {m.texto}
          </div>
        ))}
        {enviando && <div style={{ fontSize: 13, color: c.gris }}>Pensando…</div>}
      </div>

      {error && <div style={{ ...s.errorBox, margin: "0 10px 8px", fontSize: 12 }}>{error}</div>}

      {imagen && (
        <div style={{ padding: "0 10px 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <img src={imagen.previewUrl} alt="Adjunto" style={{ height: 40, borderRadius: 4 }} />
          <button onClick={() => adjuntarImagen(null)} style={{ ...s.botonSecundario, fontSize: 11, padding: "2px 8px" }}>Quitar</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, padding: 10, borderTop: `1px solid ${c.borde}`, alignItems: "center" }}>
        <input
          ref={inputArchivoRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => adjuntarImagen(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          style={{ ...s.botonSecundario, padding: "4px 8px", display: "flex" }}
          title="Adjuntar foto"
          onClick={() => inputArchivoRef.current?.click()}
        >
          <Camera size={15} />
        </button>
        <BotonVoz onResultado={(t) => setTexto((prev) => (prev ? `${prev} ${t}` : t))} />
        <input
          style={{ ...s.input, flex: 1 }}
          placeholder="Escribe…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !enviando) void enviar(); }}
        />
        <button style={s.boton} disabled={enviando} onClick={() => void enviar()}>Enviar</button>
      </div>
    </div>
  );
}
