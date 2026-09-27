const variables = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const API_BASE_URL = variables.VITE_API_URL ?? "http://localhost:3001";

export class ApiNoDisponibleError extends Error {
  constructor(baseUrl: string) {
    super(
      `No se pudo conectar con el servidor. Verifica tu conexión y que el backend (packages/api) esté corriendo en ${baseUrl}.`,
    );
    this.name = "ApiNoDisponibleError";
  }
}

export class ApiError extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
  ) {
    super(mensaje);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  get<T>(ruta: string): Promise<T>;
  post<T>(ruta: string, cuerpo: unknown): Promise<T>;
}

export interface OpcionesApiClient {
  baseUrl?: string;
  obtenerToken: () => string | null;
}

async function mensajeDeError(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: string };
    if (cuerpo.error) return cuerpo.error;
  } catch (error) {
    console.warn("Respuesta de error sin JSON legible", error);
  }
  return `El servidor respondió con un error (${respuesta.status}).`;
}

export function crearApiClient({ baseUrl = API_BASE_URL, obtenerToken }: OpcionesApiClient): ApiClient {
  async function solicitar<T>(metodo: "GET" | "POST", ruta: string, cuerpo?: unknown): Promise<T> {
    const token = obtenerToken();
    const cabeceras: Record<string, string> = {};
    if (token) cabeceras.Authorization = `Bearer ${token}`;
    if (cuerpo !== undefined) cabeceras["Content-Type"] = "application/json";

    let respuesta: Response;
    try {
      respuesta = await fetch(`${baseUrl}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
    } catch (error) {
      console.warn(`Fallo de red contra ${baseUrl}${ruta}`, error);
      throw new ApiNoDisponibleError(baseUrl);
    }
    if (!respuesta.ok) throw new ApiError(await mensajeDeError(respuesta), respuesta.status);
    return (await respuesta.json()) as T;
  }

  return {
    get: (ruta) => solicitar("GET", ruta),
    post: (ruta, cuerpo) => solicitar("POST", ruta, cuerpo),
  };
}
