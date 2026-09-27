import { randomBytes } from "node:crypto";
import { verificarDocumentoFirmado, valorEtiqueta } from "../verificacion.js";

const VIGENCIA_SEMILLA_MS = 5 * 60 * 1000;
const VIGENCIA_TOKEN_MS = 60 * 60 * 1000;

export interface TokenReceptor {
  token: string;
  expira: string;
  expedido: string;
}

export interface AutenticadorReceptor {
  emitirSemilla(): string;
  validarSemillaFirmada(xmlFirmado: string): TokenReceptor | null;
  tokenValido(token: string): boolean;
}

/**
 * Autenticación opcional del estándar emisor-receptor DGII: semilla → semilla firmada → token.
 * Semillas y tokens viven en memoria a propósito: son credenciales efímeras (minutos), no datos
 * de negocio; con una sola instancia del API alcanza. Cada semilla sirve una sola vez.
 */
export function crearAutenticadorReceptor({
  reloj = () => new Date(),
  raices,
}: { reloj?: () => Date; raices?: string[] } = {}): AutenticadorReceptor {
  const semillas = new Map<string, number>();
  const tokens = new Map<string, number>();

  function limpiar(ahora: number): void {
    for (const [valor, expira] of semillas) if (expira < ahora) semillas.delete(valor);
    for (const [token, expira] of tokens) if (expira < ahora) tokens.delete(token);
  }

  return {
    emitirSemilla() {
      const ahora = reloj();
      limpiar(ahora.getTime());
      const valor = randomBytes(48).toString("base64");
      semillas.set(valor, ahora.getTime() + VIGENCIA_SEMILLA_MS);
      return (
        '<?xml version="1.0" encoding="utf-8"?><SemillaModel xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
        `xmlns:xsd="http://www.w3.org/2001/XMLSchema"><valor>${valor}</valor><fecha>${ahora.toISOString()}</fecha></SemillaModel>`
      );
    },

    validarSemillaFirmada(xmlFirmado) {
      const ahora = reloj().getTime();
      limpiar(ahora);
      const valor = valorEtiqueta(xmlFirmado, "valor");
      if (!valor || !semillas.has(valor)) return null;
      if (!verificarDocumentoFirmado(xmlFirmado, null, { raices }).valido) return null;
      semillas.delete(valor);
      const token = randomBytes(32).toString("base64url");
      const expira = ahora + VIGENCIA_TOKEN_MS;
      tokens.set(token, expira);
      return { token, expira: new Date(expira).toISOString(), expedido: new Date(ahora).toISOString() };
    },

    tokenValido(token) {
      const expira = tokens.get(token);
      return expira !== undefined && expira >= reloj().getTime();
    },
  };
}
