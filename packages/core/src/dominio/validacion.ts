/**
 * Validaciones estándar (§5): RNC/cédula con formato válido, correo válido,
 * campos obligatorios por pantalla. Funciones puras, reutilizables por UI y repos.
 */

export interface ErrorValidacion {
  campo: string;
  mensaje: string;
}

/** Correo con formato razonable (no exhaustivo, evita falsos negativos comunes). */
export function esCorreoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
}

/**
 * Valida el dígito verificador de un RNC (9 dígitos) usando el algoritmo de la
 * DGII (pesos 7,9,8,6,5,4,3,2 sobre los primeros 8 dígitos, módulo 11).
 */
export function esRncValido(rnc: string): boolean {
  const d = rnc.replace(/\D/g, "");
  if (d.length !== 9) return false;
  const pesos = [7, 9, 8, 6, 5, 4, 3, 2];
  let suma = 0;
  for (let i = 0; i < 8; i++) suma += Number(d[i]) * pesos[i];
  const resto = suma % 11;
  const digito = resto === 0 ? 2 : resto === 1 ? 1 : 11 - resto;
  return digito === Number(d[8]);
}

/**
 * Valida una cédula dominicana (11 dígitos) con el algoritmo de Luhn sobre los
 * primeros 10 dígitos contra el dígito verificador.
 */
export function esCedulaValida(cedula: string): boolean {
  const d = cedula.replace(/\D/g, "");
  if (d.length !== 11) return false;
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    let n = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (n > 9) n -= 9;
    suma += n;
  }
  const digito = (10 - (suma % 10)) % 10;
  return digito === Number(d[10]);
}

/** Valida un documento según su tipo. `null`/vacío es válido (documento opcional). */
export function esDocumentoValido(
  tipo: "rnc" | "cedula" | null | undefined,
  numero: string | null | undefined,
): boolean {
  if (!tipo || !numero) return true;
  return tipo === "rnc" ? esRncValido(numero) : esCedulaValida(numero);
}

/** True si el valor tiene contenido (no null/undefined/espacios). */
export function tieneValor(v: unknown): boolean {
  return v != null && String(v).trim().length > 0;
}

/**
 * Normaliza texto para búsqueda: minúsculas y sin acentos, de modo que "maria"
 * encuentre "María". SQLite no quita diacríticos sin ICU, por eso el filtro de
 * búsqueda se hace en JS a escala de MVP (ver repos).
 */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // marcas diacríticas combinantes
    .toLowerCase()
    .trim();
}
