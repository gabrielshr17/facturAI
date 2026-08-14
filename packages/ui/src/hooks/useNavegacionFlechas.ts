import { useEffect } from "react";

const SELECTOR_ENFOCABLE = 'input, select, button, textarea, [tabindex]:not([tabindex="-1"])';

/** Visible y habilitado — filtra lo que no debería recibir foco (oculto, deshabilitado). */
function esEnfocable(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("disabled")) return false;
  return el.offsetParent !== null;
}

/** Arriba/abajo tiene sentido interceptarlo solo en <input>: en <textarea> mueve el cursor entre
 *  líneas (comportamiento normal de edición) y en <select> cambia la opción elegida (también
 *  normal/esperado) — ninguno de esos dos se debe romper. */
function esCampoQueDebeNavegar(el: Element): boolean {
  return el.tagName === "INPUT";
}

/**
 * Convierte ArrowUp/ArrowDown en Shift+Tab/Tab dentro de campos de texto — para no chocar con el
 * comportamiento nativo de `<input type="number">` de cambiar el valor con las flechas, que es
 * justo lo que no se quiere: las flechas deben mover el foco al campo siguiente/anterior, no alterar
 * una cantidad o un precio. Se registra una sola vez (en `AppShell`) y aplica a toda la app — así
 * cualquier pantalla queda operable sin mouse sin tener que tocar cada formulario por separado.
 */
export function useNavegacionFlechas() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      // Si un manejador más específico (p.ej. navegar una lista de resultados) ya resolvió esta
      // tecla con preventDefault(), no lo pisamos moviendo el foco a otro campo.
      if (e.defaultPrevented) return;
      const activo = document.activeElement;
      if (!activo || !esCampoQueDebeNavegar(activo)) return;

      const enfocables = Array.from(document.querySelectorAll(SELECTOR_ENFOCABLE)).filter(esEnfocable);
      const indice = enfocables.indexOf(activo as HTMLElement);
      if (indice === -1) return;

      e.preventDefault();
      const destino = enfocables[e.key === "ArrowDown" ? indice + 1 : indice - 1];
      if (!destino) return;
      destino.focus();
      if (destino instanceof HTMLInputElement || destino instanceof HTMLTextAreaElement) {
        destino.select();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
