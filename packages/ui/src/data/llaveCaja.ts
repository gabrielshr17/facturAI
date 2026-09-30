const CLAVE_LS = "sfr_llave_caja";

/** La llave de la caja identifica a ESTA máquina ante el backend fiscal: es de la máquina, no del negocio. */
export function obtenerLlaveCaja(): string | null {
  try {
    return localStorage.getItem(CLAVE_LS);
  } catch (error) {
    console.warn("No se pudo leer la llave de la caja", error);
    return null;
  }
}

export function guardarLlaveCaja(llave: string | null): void {
  try {
    if (llave) localStorage.setItem(CLAVE_LS, llave);
    else localStorage.removeItem(CLAVE_LS);
  } catch (error) {
    console.warn("No se pudo guardar la llave de la caja", error);
  }
}
