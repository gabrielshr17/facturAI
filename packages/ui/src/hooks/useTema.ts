import { useCallback, useEffect, useState } from "react";

export type Tema = "claro" | "oscuro";

const CLAVE_LS = "sfr_tema";

function temaInicial(): Tema {
  const guardado = localStorage.getItem(CLAVE_LS);
  return guardado === "claro" ? "claro" : "oscuro";
}

/**
 * Tema visual (claro/oscuro), persistido en localStorage y aplicado como
 * `data-theme` en `<html>` — `estilos-globales.css` define los colores para
 * cada valor, y `estilos.ts` los referencia vía `var(--sfr-...)`, así que
 * cambiar el atributo repinta toda la app sin recorrer cada pantalla.
 */
export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", tema === "oscuro" ? "dark" : "light");
    localStorage.setItem(CLAVE_LS, tema);
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === "oscuro" ? "claro" : "oscuro")), []);

  return [tema, alternar];
}
