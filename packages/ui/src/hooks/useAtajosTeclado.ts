import { useEffect, useRef } from "react";

type ManejadorAtajo = (e: KeyboardEvent) => void;

/**
 * Mapa de tecla a su acción. Claves como "F1", "F10", "Escape", o con
 * modificador(es): "Ctrl+P" (Ctrl en Windows/Linux, Cmd en Mac), "Alt+1",
 * "Ctrl+Alt+X". El orden de los modificadores en la clave siempre es
 * Ctrl, luego Alt, luego Shift (ver `normalizarTecla`).
 */
export type MapaAtajos = Record<string, ManejadorAtajo>;

/** Shift ya va "horneado" en `e.key` para símbolos: en un teclado US, Shift+"=" produce
 *  `e.key === "+"`, no "=". Sumar "Shift" al nombre ahí también lo contaría dos veces — un atajo
 *  registrado como "+" (p.ej. sumar cantidad en Ventas) nunca matchearía en la fila principal del
 *  teclado, solo desde el "+" del numérico (que no necesita Shift). Shift sí importa para letras
 *  (mayúscula intencional), así que ahí sigue agregándose. */
function normalizarTecla(e: KeyboardEvent): string {
  const partes: string[] = [];
  if (e.ctrlKey || e.metaKey) partes.push("Ctrl");
  if (e.altKey) partes.push("Alt");
  const esLetra = e.key.length === 1 && /[a-zA-Z]/.test(e.key);
  if (e.shiftKey && esLetra) partes.push("Shift");
  const tecla = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  partes.push(tecla);
  return partes.join("+");
}

/**
 * Registra atajos de teclado globales (teclas de función, Esc, Ctrl+letra,
 * etc.) mientras el componente esté montado. `activo` permite desactivar el
 * mapa sin desmontar (ej. una pantalla detrás de un modal que usa las mismas
 * teclas).
 */
export function useAtajosTeclado(mapa: MapaAtajos, activo = true) {
  const mapaRef = useRef(mapa);
  mapaRef.current = mapa;

  useEffect(() => {
    if (!activo) return;
    function onKeyDown(e: KeyboardEvent) {
      const manejador = mapaRef.current[normalizarTecla(e)];
      if (!manejador) return;
      e.preventDefault();
      manejador(e);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activo]);
}
