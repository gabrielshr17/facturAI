import { useEffect, useRef } from "react";

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Lo que un diálogo modal necesita para ser usable sin mouse y con lector de pantalla:
 *
 * 1. **Devolver el foco**: al cerrarse vuelve al elemento que lo abrió. Sin esto el foco cae al
 *    principio del documento y hay que re-tabular toda la pantalla para seguir donde se estaba.
 * 2. **Atrapar el Tab**: mientras está abierto, tabular no debe escaparse al contenido de atrás —
 *    que visualmente está tapado por el overlay, así que el foco "desaparecería" para quien ve, y
 *    para quien usa lector se leería una pantalla que en realidad no está disponible.
 *
 * Devuelve el ref que hay que poner en la tarjeta del modal. Se usa junto con
 * `role="dialog" aria-modal="true"` y un `aria-labelledby` que apunte a su título.
 */
export function useModalAccesible<T extends HTMLElement = HTMLDivElement>() {
  const contenedorRef = useRef<T>(null);

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const cont = contenedorRef.current;
      if (!cont) return;
      const enfocables = Array.from(cont.querySelectorAll<HTMLElement>(ENFOCABLES))
        .filter((el) => el.offsetParent !== null);
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      // El ciclo se cierra a mano en los extremos; en el medio el navegador se encarga solo.
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // `isConnected`: si el disparador se fue del DOM junto con el modal, enfocarlo no haría nada.
      if (previo?.isConnected) previo.focus();
    };
  }, []);

  return contenedorRef;
}
