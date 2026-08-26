import { useRef, useState } from "react";
import { Mic } from "lucide-react";
import { s, c } from "../estilos.js";

/**
 * Entrada por voz (§ Fase 3) usando la Web Speech API del navegador — sin
 * servicio externo, gratis, pero depende de conexión y solo funciona en
 * navegadores con soporte (Chrome/Edge; no todos, ver `soportado`).
 */
interface SpeechRecognitionResultado {
  results: { [i: number]: { [j: number]: { transcript: string } } };
}
interface SpeechRecognitionInstancia {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechRecognitionResultado) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function obtenerConstructor(): (new () => SpeechRecognitionInstancia) | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => SpeechRecognitionInstancia) | undefined;
  return Ctor ?? null;
}

export interface BotonVozProps {
  onResultado: (texto: string) => void;
  idioma?: string;
}

export function BotonVoz({ onResultado, idioma = "es-DO" }: BotonVozProps) {
  const [escuchando, setEscuchando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconocimientoRef = useRef<SpeechRecognitionInstancia | null>(null);
  const Ctor = obtenerConstructor();

  if (!Ctor) return null; // navegador sin soporte: no se muestra el botón

  function iniciar() {
    if (!Ctor) return;
    setError(null);
    const reconocimiento = new Ctor();
    reconocimiento.lang = idioma;
    reconocimiento.interimResults = false;
    reconocimiento.maxAlternatives = 1;
    reconocimiento.onresult = (e) => {
      const texto = e.results[0]?.[0]?.transcript;
      if (texto) onResultado(texto);
    };
    reconocimiento.onerror = () => {
      setError("No se pudo reconocer el audio. Intenta de nuevo.");
      setEscuchando(false);
    };
    reconocimiento.onend = () => setEscuchando(false);
    reconocimientoRef.current = reconocimiento;
    reconocimiento.start();
    setEscuchando(true);
  }

  function detener() {
    reconocimientoRef.current?.stop();
    setEscuchando(false);
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        style={{
          ...s.botonSecundario,
          display: "inline-flex", alignItems: "center", gap: 6,
          ...(escuchando ? { background: c.rojo, color: "white", borderColor: c.rojo } : {}),
        }}
        onClick={escuchando ? detener : iniciar}
        title="Buscar por voz"
      >
        <Mic size={15} /> {escuchando ? "Escuchando…" : "Voz"}
      </button>
      {error && <span style={{ color: c.rojo, fontSize: 12 }}>{error}</span>}
    </div>
  );
}
