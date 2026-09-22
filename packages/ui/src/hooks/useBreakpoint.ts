import { useEffect, useState } from "react";

/**
 * Ancho de pantalla en cuatro tramos. La app se estiliza con objetos `style={{}}` en línea, que no
 * admiten `@media`, así que el "responsive" tiene que decidirse en JS: cada pantalla pregunta en qué
 * tramo está y arma su layout. A cambio, en `amplio` toda rama devuelve exactamente lo que había
 * antes — la app de escritorio (la que se usa a diario) no cambia ni un pixel.
 *
 * El ORDEN en que las cosas ceden es deliberado: **lo primero que se achica siempre es la barra
 * lateral**, que es puro cromo de navegación. Recién cuando encogerla ya no alcanza se toca el
 * contenido, y la barra solo desaparece del todo en el último tramo:
 *
 * | Tramo       | Ancho      | Barra lateral      | Contenido            |
 * |-------------|------------|--------------------|----------------------|
 * | `amplio`    | ≥1100      | completa (216px)   | dos columnas         |
 * | `medio`     | 940–1099   | tira de iconos     | dos columnas         |
 * | `compacto`  | 700–939    | tira de iconos     | apilado              |
 * | `movil`     | <700       | cajón (hamburguesa)| apilado              |
 *
 * Los cortes salen de la cuenta de anchos reales de Ventas, la pantalla más exigente:
 * barra + padding del main (64) + Totales (280) + gap (16) + ~520 que necesita la lista del ticket.
 * Con la barra completa (216) eso da ~1096; con la tira de iconos (60), ~940.
 */
export type Tramo = "movil" | "compacto" | "medio" | "amplio";

const ANCHO_COMPACTO = 700;
const ANCHO_MEDIO = 940;
const ANCHO_AMPLIO = 1100;

function tramoActual(): Tramo {
  // `window` puede no existir (SSR/pruebas): se asume amplio, que es el layout sin ramas.
  if (typeof window === "undefined") return "amplio";
  const ancho = window.innerWidth;
  if (ancho < ANCHO_COMPACTO) return "movil";
  if (ancho < ANCHO_MEDIO) return "compacto";
  if (ancho < ANCHO_AMPLIO) return "medio";
  return "amplio";
}

/**
 * Tramo de ancho actual, recalculado cuando la ventana cruza un límite. Se usan `matchMedia` en vez
 * de escuchar `resize` porque el navegador solo avisa al CRUZAR el límite, no en cada pixel del
 * arrastre — así redimensionar la ventana no dispara un render por frame.
 */
export function useBreakpoint(): Tramo {
  const [tramo, setTramo] = useState<Tramo>(tramoActual);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const consultas = [ANCHO_COMPACTO, ANCHO_MEDIO, ANCHO_AMPLIO].map((px) =>
      window.matchMedia(`(min-width: ${px}px)`),
    );
    const alCambiar = () => setTramo(tramoActual());
    for (const q of consultas) q.addEventListener("change", alCambiar);
    // El primer render puede haber ocurrido antes de que el layout se asentara (fuentes, barra de
    // scroll): se re-sincroniza una vez al montar.
    alCambiar();
    return () => {
      for (const q of consultas) q.removeEventListener("change", alCambiar);
    };
  }, []);

  return tramo;
}

/**
 * ¿Toca apilar el contenido en una sola columna? Ojo: NO es "¿no es amplio?" — en `medio` la barra
 * lateral ya se encogió pero el contenido sigue en dos columnas, que es justamente el escalón que
 * hace que la barra sea siempre lo primero en ceder.
 */
export function useEsAngosto(): boolean {
  const tramo = useBreakpoint();
  return tramo === "compacto" || tramo === "movil";
}

/** La barra lateral se muestra como tira de iconos (sin etiquetas), pero sigue en el flujo. */
export function useNavSoloIconos(): boolean {
  const tramo = useBreakpoint();
  return tramo === "medio" || tramo === "compacto";
}

/** La barra lateral sale del flujo y pasa a ser un cajón detrás del botón de hamburguesa. */
export function useNavEnCajon(): boolean {
  return useBreakpoint() === "movil";
}

/** Cierto solo en pantallas de teléfono (<700px). */
export function useEsMovil(): boolean {
  return useBreakpoint() === "movil";
}

/**
 * ¿Se maneja con el dedo? Es una pregunta DISTINTA a "¿es angosto?" y hay que resolverla con el
 * tipo de puntero, no con el ancho: una tablet tiene 800-1100px (nada de angosta) pero no tiene
 * teclado ni mouse, y una ventana de escritorio achicada a 600px sí los tiene. Usar el ancho como
 * proxy dejaba a las tablets sin el trato táctil — campos que disparan zoom en iOS, botones chicos
 * y el teclado abriéndose solo al entrar a Ventas.
 */
export function useEsTactil(): boolean {
  const [tactil, setTactil] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(pointer: coarse)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    // Cambia de verdad en híbridos (Surface, iPad con trackpad conectado).
    const q = window.matchMedia("(pointer: coarse)");
    const alCambiar = () => setTactil(q.matches);
    q.addEventListener("change", alCambiar);
    return () => q.removeEventListener("change", alCambiar);
  }, []);

  return tactil;
}

/**
 * Quita la pista de atajo de un texto de botón cuando no hay teclado físico que la justifique:
 * "Cobrar (F12)" → "Cobrar". Con teclado devuelve el texto intacto.
 */
export function sinAtajo(texto: string, ocultar: boolean): string {
  return ocultar ? texto.replace(/\s*\((?:F\d{1,2}|Ctrl\+[^)]+|Esc|Insert|Supr)\)/gi, "") : texto;
}
