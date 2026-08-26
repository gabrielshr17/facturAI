/**
 * Aritmética compartida para navegar listas/tablas con el teclado: ↑/↓ mueve la fila resaltada,
 * ←/→ mueve entre las acciones de ESA fila (favorito, editar, eliminar, …), con "fila" como posición
 * de reposo (sin acción resaltada) en el extremo izquierdo del recorrido. Mismo patrón en toda la app
 * (búsqueda de productos en Ventas, catálogos de Productos/Clientes/Promociones) — centralizado acá
 * para no repetir el `Math.min(Math.max(...))` de cada lado en cada pantalla.
 */

/** Nuevo índice de fila resaltada, sin salirse de `[0, longitud - 1]`. */
export function moverIndiceFila(actual: number, delta: number, longitud: number): number {
  if (longitud === 0) return -1;
  return Math.min(Math.max(actual + delta, 0), longitud - 1);
}

/** Nueva acción resaltada dentro de la fila: recorre ["fila", ...disponibles] sin salirse de los bordes
 *  — así ← siempre puede volver a "fila" y → nunca pasa de la última acción de ESA fila en particular
 *  (dos filas pueden tener distintas acciones disponibles, p.ej. "Ajustar" solo si hay inventario). */
export function moverAccionFila<T extends string>(actual: T | "fila", delta: number, disponibles: readonly T[]): T | "fila" {
  const orden: (T | "fila")[] = ["fila", ...disponibles];
  const i = orden.indexOf(actual);
  const siguiente = Math.min(Math.max((i === -1 ? 0 : i) + delta, 0), orden.length - 1);
  return orden[siguiente];
}
