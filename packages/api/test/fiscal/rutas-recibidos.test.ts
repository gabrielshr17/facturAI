import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { rutaRecibidos } from "../../src/routes/recibidos.js";
import type { ServicioRecibidos } from "../../src/fiscal/servicio-recibidos.js";
import { DocumentoFiscalInvalidoError } from "../../src/fiscal/errores.js";

function servicio(cambios: Partial<ServicioRecibidos> = {}): ServicioRecibidos {
  return {
    listar: async () => [],
    responder: async () => ({ dgii: { aceptada: true, mensajes: [] }, emisor: { entregada: true } }),
    marcarImportado: async () => undefined,
    ...cambios,
  };
}

async function app(s: ServicioRecibidos | null) {
  const a = Fastify();
  await a.register(rutaRecibidos(s));
  return a;
}

describe("rutas /fiscal/recibidos", () => {
  it("lista los recibidos", async () => {
    const res = await (await app(servicio())).inject({ url: "/fiscal/recibidos" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ recibidos: [] });
  });

  it("responde comercialmente y valida el cuerpo", async () => {
    const a = await app(servicio());
    const sinCuerpo = await a.inject({ method: "POST", url: "/fiscal/recibidos/r-1/respuesta", payload: {} });
    expect(sinCuerpo.statusCode).toBe(400);
    const ok = await a.inject({ method: "POST", url: "/fiscal/recibidos/r-1/respuesta", payload: { aprobado: true } });
    expect(ok.statusCode).toBe(200);
  });

  it("traduce errores: 400 validación, 404 inexistente, 503 sin configurar", async () => {
    const invalido = await (
      await app(servicio({ responder: async () => Promise.reject(new DocumentoFiscalInvalidoError("ya respondido")) }))
    ).inject({ method: "POST", url: "/fiscal/recibidos/r-1/respuesta", payload: { aprobado: true } });
    expect(invalido.statusCode).toBe(400);
    const inexistente = await (
      await app(servicio({ marcarImportado: async () => Promise.reject(new Error("El e-CF recibido x no existe.")) }))
    ).inject({ method: "POST", url: "/fiscal/recibidos/x/importado" });
    expect(inexistente.statusCode).toBe(404);
    const sinConfigurar = await (await app(null)).inject({ url: "/fiscal/recibidos" });
    expect(sinConfigurar.statusCode).toBe(503);
  });
});
