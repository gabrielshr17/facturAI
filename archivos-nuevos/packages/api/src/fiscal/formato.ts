const DESFASE_REPUBLICA_DOMINICANA_MS = -4 * 60 * 60 * 1000;

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function enHoraDominicana(fecha: Date): Date {
  return new Date(fecha.getTime() + DESFASE_REPUBLICA_DOMINICANA_MS);
}

export function montoDgii(valor: number): string {
  return (Math.round(valor * 100) / 100).toFixed(2);
}

export function fechaDgii(fecha: Date | string): string {
  const d = enHoraDominicana(typeof fecha === "string" ? new Date(fecha) : fecha);
  return `${dosDigitos(d.getUTCDate())}-${dosDigitos(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

export function fechaHoraDgii(fecha: Date | string): string {
  const d = enHoraDominicana(typeof fecha === "string" ? new Date(fecha) : fecha);
  return `${fechaDgii(fecha)} ${dosDigitos(d.getUTCHours())}:${dosDigitos(d.getUTCMinutes())}:${dosDigitos(d.getUTCSeconds())}`;
}
