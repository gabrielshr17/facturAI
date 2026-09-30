export interface SolicitudRegistrada {
  metodo: string;
  url: string;
  autorizacion: string | null;
  archivo: { nombre: string; contenido: string } | null;
}

export type Respondedor = (solicitud: SolicitudRegistrada) => Response | Promise<Response>;

export const SEMILLA_XML =
  '<?xml version="1.0" encoding="utf-8"?><SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'xmlns:xsd="http://www.w3.org/2001/XMLSchema"><valor>semilla-123</valor><fecha>2026-10-01T14:30:00-04:00</fecha></SemillaModel>';

export function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });
}

export function crearDgiiFalsa(rutas: Record<string, Respondedor>) {
  const solicitudes: SolicitudRegistrada[] = [];
  let tokensEmitidos = 0;

  const porDefecto: Record<string, Respondedor> = {
    "autenticacion/semilla": () => new Response(SEMILLA_XML, { headers: { "content-type": "text/xml" } }),
    "autenticacion/validarsemilla": () => {
      tokensEmitidos += 1;
      return json({
        token: `token-${tokensEmitidos}`,
        expira: "2026-10-01T19:30:00Z",
        expedido: "2026-10-01T18:30:00Z",
      });
    },
  };

  const fetchFalso: typeof fetch = async (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const cabeceras = new Headers(init?.headers);
    let archivo: SolicitudRegistrada["archivo"] = null;
    if (init?.body instanceof FormData) {
      const parte = init.body.get("xml");
      if (parte instanceof File) archivo = { nombre: parte.name, contenido: await parte.text() };
    }
    const solicitud: SolicitudRegistrada = {
      metodo: init?.method ?? "GET",
      url,
      autorizacion: cabeceras.get("authorization"),
      archivo,
    };
    solicitudes.push(solicitud);

    const todas = { ...porDefecto, ...rutas };
    const clave = Object.keys(todas).find((ruta) => url.includes(ruta));
    if (!clave) return new Response("no encontrado", { status: 404 });
    return todas[clave]!(solicitud);
  };

  return { fetch: fetchFalso, solicitudes };
}
