import { ValidacionError } from "@sfr/core";

/**
 * Traduce cualquier cosa que caiga en un `catch` a un mensaje que el usuario
 * pueda leer y actuar.
 *
 * Antes las pantallas hacían `setError(String(e))` y en pantalla aparecía el
 * texto crudo del motor de base de datos — "SqliteError: UNIQUE constraint
 * failed: producto.codigo_barra", "FOREIGN KEY constraint failed",
 * "Error: database is locked" — que no dice qué pasó ni qué hacer. Acá:
 *
 *  - `ValidacionError` ya trae mensajes escritos para el usuario: se usan tal cual.
 *  - Los errores conocidos del motor se traducen a español llano.
 *  - Lo desconocido cae a un mensaje genérico honesto, y el detalle técnico se
 *    manda a la consola (para depurar) en vez de a la cara del usuario.
 */
export function mensajesError(e: unknown): string[] {
  if (e instanceof ValidacionError) return e.errores.map((x) => x.mensaje);
  return [mensajeError(e)];
}

export function mensajeError(e: unknown): string {
  if (e instanceof ValidacionError) return e.errores.map((x) => x.mensaje).join(" ");

  const crudo = e instanceof Error ? e.message : String(e);
  const traducido = traducir(crudo);
  if (traducido) return traducido;

  // Un mensaje ya escrito en español para el usuario (los de `MSG` en el core, o
  // los de impresión) se reconoce porque no parece jerga: sin "constraint", sin
  // "Error:" delante ni nombres de tabla. Se muestra tal cual.
  if (esMensajeParaUsuario(crudo)) return crudo;

  console.error("Error sin traducir:", e);
  return "No se pudo completar la operación. Vuelve a intentarlo; si sigue pasando, cierra y abre el programa.";
}

const TABLA_EN_ESPANOL: Record<string, string> = {
  producto: "producto",
  cliente: "cliente",
  proveedor: "suplidor",
  departamento: "departamento",
  factura: "factura",
  factura_linea: "renglón de la factura",
  comprobante_fiscal: "comprobante fiscal",
  secuencia_ncf: "secuencia de NCF",
  promocion: "promoción",
  compra: "compra",
  cotizacion: "cotización",
};

function traducir(crudo: string): string | null {
  const t = crudo.toLowerCase();

  if (t.includes("unique constraint failed")) {
    if (t.includes("producto.codigo_barra")) {
      return "Ese código de barra ya está asignado a otro producto. Cámbialo, déjalo vacío, " +
        "o busca el producto que ya existe y edítalo.";
    }
    if (t.includes("comprobante_fiscal.ncf")) {
      return "Ese NCF ya fue usado en otro comprobante. Revisa la secuencia en " +
        "Configuración → Comprobantes fiscales.";
    }
    const campo = /unique constraint failed: ([a-z_]+)\.([a-z_]+)/i.exec(crudo);
    const entidad = campo ? TABLA_EN_ESPANOL[campo[1]] ?? campo[1] : "registro";
    return `Ya existe un ${entidad} con ese dato y no se permite repetirlo.`;
  }

  if (t.includes("foreign key constraint failed")) {
    return "No se puede guardar porque el registro está enlazado a otro que ya no existe " +
      "(o que todavía lo usa). Actualiza la pantalla y vuelve a intentarlo.";
  }

  if (t.includes("not null constraint failed")) {
    const campo = /not null constraint failed: [a-z_]+\.([a-z_]+)/i.exec(crudo);
    return campo
      ? `Falta llenar el campo "${campo[1].replace(/_/g, " ")}".`
      : "Falta llenar un campo obligatorio.";
  }

  if (t.includes("check constraint failed")) {
    return "Alguno de los datos no es válido para este tipo de registro. Revisa lo que escribiste.";
  }

  if (t.includes("database is locked") || t.includes("sqlite_busy")) {
    return "La base de datos está ocupada en este momento (¿hay otra ventana del programa guardando?). " +
      "Espera un segundo y vuelve a intentarlo.";
  }

  if (t.includes("disk i/o error") || t.includes("database or disk is full") || t.includes("enospc")) {
    return "No se pudo escribir en el disco: puede estar lleno o la carpeta de datos sin permiso. " +
      "Libera espacio y vuelve a intentarlo.";
  }

  if (t.includes("database disk image is malformed") || t.includes("file is not a database")) {
    return "El archivo de la base de datos está dañado. Restaura la copia de seguridad más reciente " +
      "desde Configuración antes de seguir trabajando.";
  }

  if (t.includes("failed to fetch") || t.includes("networkerror") || t.includes("err_connection")) {
    return "No hay conexión con el servidor. Revisa el internet y vuelve a intentarlo.";
  }

  return null;
}

/** Heurística: ¿este texto ya está escrito para que lo lea una persona? */
function esMensajeParaUsuario(crudo: string): boolean {
  if (/constraint|sqlite|undefined|null pointer|stack|\bat [A-Za-z]+\./i.test(crudo)) return false;
  // Un mensaje redactado termina en punto o signo y tiene varias palabras.
  return /\s/.test(crudo.trim()) && crudo.trim().split(/\s+/).length >= 3;
}
