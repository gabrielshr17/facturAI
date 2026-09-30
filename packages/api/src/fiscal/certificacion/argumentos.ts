export interface ArgumentosSetPruebas {
  archivo: string | null;
  salida: string;
  enviar: boolean;
}

const OPCIONES_CON_VALOR = new Set(["--salida"]);

export function leerArgumentosSetPruebas(args: string[]): ArgumentosSetPruebas {
  const resultado: ArgumentosSetPruebas = { archivo: null, salida: "set-pruebas-salida", enviar: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--enviar") resultado.enviar = true;
    else if (OPCIONES_CON_VALOR.has(arg)) {
      const valor = args[i + 1];
      if (valor !== undefined) resultado.salida = valor;
      i += 1;
    } else if (!arg.startsWith("--") && resultado.archivo === null) resultado.archivo = arg;
  }
  return resultado;
}
