export interface RespuestaAprobacion {
  aceptada: boolean;
  estado: "aceptada" | "rechazada" | "no_reconocida";
  mensajes: string[];
  respuestaCruda: string;
}

const LIMITE_CRUDA = 4000;

type Campos = Map<string, unknown>;

function camposDeObjeto(valor: unknown): Campos | null {
  const objeto = Array.isArray(valor) ? valor[0] : valor;
  if (typeof objeto !== "object" || objeto === null || Array.isArray(objeto)) return null;
  return new Map(Object.entries(objeto).map(([clave, v]) => [clave.toLowerCase(), v]));
}

function camposDeXml(texto: string): Campos | null {
  const campos: Campos = new Map();
  for (const nombre of ["codigo", "estado"]) {
    const coincidencia = new RegExp(`<${nombre}>([\\s\\S]*?)</${nombre}>`, "i").exec(texto);
    if (coincidencia) campos.set(nombre, coincidencia[1]?.trim());
  }
  const mensajes = [...texto.matchAll(/<mensajes?>([\s\S]*?)<\/mensajes?>/gi)].map((m) => m[1]?.trim() ?? "");
  if (mensajes.length > 0) campos.set("mensaje", mensajes);
  return campos.size > 0 ? campos : null;
}

function leerCampos(texto: string): Campos | null {
  if (texto.startsWith("{") || texto.startsWith("[")) {
    try {
      return camposDeObjeto(JSON.parse(texto));
    } catch {
      return null;
    }
  }
  if (texto.startsWith("<")) return camposDeXml(texto);
  return null;
}

function comoTexto(valor: unknown): string {
  return typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
}

function mensajesDe(campos: Campos): string[] {
  const bruto = campos.get("mensaje") ?? campos.get("mensajes");
  const lista = Array.isArray(bruto) ? bruto : bruto === undefined ? [] : [bruto];
  return lista
    .map((m) => {
      if (typeof m === "string" || typeof m === "number") return String(m).trim();
      const entrada = camposDeObjeto(m);
      if (!entrada) return "";
      const valor = comoTexto(entrada.get("valor"));
      const codigo = comoTexto(entrada.get("codigo"));
      return codigo ? `${codigo}: ${valor}` : valor;
    })
    .filter((m) => m !== "");
}

function decidir(codigo: string, estado: string): RespuestaAprobacion["estado"] {
  if (codigo === "1") return "aceptada";
  if (codigo === "2") return "rechazada";
  const texto = `${codigo} ${estado}`.toLowerCase();
  if (/rechaz/.test(texto)) return "rechazada";
  if (/aprobad|aceptad/.test(texto)) return "aceptada";
  return "no_reconocida";
}

/**
 * Interpreta la respuesta del servicio de aprobación comercial de la DGII (JSON o XML). Solo declara
 * "rechazada" cuando la respuesta lo dice; si no se entiende, devuelve "no_reconocida" junto con la
 * respuesta cruda, para que nadie tome por rechazo algo que no se pudo leer.
 */
export function interpretarRespuestaAprobacion(cuerpo: string): RespuestaAprobacion {
  const texto = cuerpo.trim();
  const respuestaCruda = texto.slice(0, LIMITE_CRUDA);
  const campos = leerCampos(texto);
  const mensajes = campos ? mensajesDe(campos) : [];
  const estado = campos ? decidir(comoTexto(campos.get("codigo")), comoTexto(campos.get("estado"))) : "no_reconocida";
  if (estado === "no_reconocida") {
    return {
      aceptada: false,
      estado,
      mensajes: [...mensajes, `Respuesta no reconocida: ${respuestaCruda.slice(0, 300) || "(vacía)"}`],
      respuestaCruda,
    };
  }
  return { aceptada: estado === "aceptada", estado, mensajes, respuestaCruda };
}
