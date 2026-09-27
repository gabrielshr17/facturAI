import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { rutaFiscal } from "../../src/routes/fiscal.js";
import type { ModuloFiscal } from "../../src/fiscal/iniciar.js";
import type { ServicioEmision } from "../../src/fiscal/servicio-emision.js";
import { DgiiNoDisponibleError, DocumentoFiscalInvalidoError } from "../../src/fiscal/errores.js";
import { consumoPrueba } from "./datos-prueba.js";

function modulo(servicio: Partial<ServicioEmision>): ModuloFiscal {
  return {
    disponible: true,
    ambiente: "testecf",
    rncEmisor: "131880738",
    certificadoVence: new Date("2027-01-01T00:00:00Z"),
    firmar: (xml) => xml,
    servicio: {
      emitir: async () => ({ estado: "aceptado" }),
      consultar: async () => ({ estado: "aceptado" }),
      anular: async () => ({ aceptada: true, mensajes: [] }),
      ...servicio,
    } as ServicioEmision,
  };
}

async function app(m: ModuloFiscal) {
  const a = Fastify();
  await a.register(rutaFiscal(m));
  return a;
}

describe("rutas /fiscal", () => {
  it("emite para el RNC configurado", async () => {
    const res = await (
      await app(modulo({}))
    ).inject({ method: "POST", url: "/fiscal/comprobantes", payload: consumoPrueba() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ estado: "aceptado" });
  });

  it("se niega a firmar para otro RNC", async () => {
    const otro = consumoPrueba({ emisor: { ...consumoPrueba().emisor, rnc: "101010101" } });
    const res = await (await app(modulo({}))).inject({ method: "POST", url: "/fiscal/comprobantes", payload: otro });
    expect(res.statusCode).toBe(403);
  });

  it("se niega a anular secuencias de otro RNC", async () => {
    const res = await (
      await app(modulo({}))
    ).inject({
      method: "POST",
      url: "/fiscal/anulaciones",
      payload: { rncEmisor: "101010101", rangos: [] },
    });
    expect(res.statusCode).toBe(403);
  });

  it("traduce documento inválido a 400 y DGII caída a 503", async () => {
    const invalido = await (
      await app(modulo({ emitir: async () => Promise.reject(new DocumentoFiscalInvalidoError("falta X")) }))
    ).inject({ method: "POST", url: "/fiscal/comprobantes", payload: consumoPrueba() });
    expect(invalido.statusCode).toBe(400);
    const caida = await (
      await app(modulo({ emitir: async () => Promise.reject(new DgiiNoDisponibleError("caída")) }))
    ).inject({ method: "POST", url: "/fiscal/comprobantes", payload: consumoPrueba() });
    expect(caida.statusCode).toBe(503);
  });

  it("sin módulo configurado responde 503 con el motivo", async () => {
    const res = await (
      await app({ disponible: false, ambiente: "testecf", motivo: "Falta el certificado." })
    ).inject({ method: "POST", url: "/fiscal/comprobantes", payload: consumoPrueba() });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toContain("Falta el certificado.");
  });
});
