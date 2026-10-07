import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { rutaSalud } from "../src/routes/health.js";
import type { ModuloFiscal } from "../src/fiscal/iniciar.js";

describe("GET /health", () => {
  it("informa si la facturación electrónica está activa y en qué ambiente", async () => {
    const app = Fastify();
    const modulo: ModuloFiscal = {
      disponible: false,
      ambiente: "testecf",
      codigo: "falta-certificado",
      motivo: "Falta el certificado.",
    };
    await app.register(rutaSalud(modulo));
    const cuerpo = (await app.inject({ url: "/health" })).json();
    expect(cuerpo).toMatchObject({ estado: "ok", fiscal: { disponible: false, ambiente: "testecf" } });
    expect(JSON.stringify(cuerpo)).not.toContain("Falta el certificado.");
  });

  it("explica con un código corto por qué la facturación electrónica está inactiva", async () => {
    const app = Fastify();
    const modulo: ModuloFiscal = {
      disponible: false,
      ambiente: "testecf",
      codigo: "sn-no-coincide",
      motivo: "El campo SN del certificado (RNC101010101) no corresponde al RNC 131880738.",
    };
    await app.register(rutaSalud(modulo));
    const cuerpo = (await app.inject({ url: "/health" })).json();
    expect(cuerpo.fiscal).toEqual({ disponible: false, ambiente: "testecf", motivo: "sn-no-coincide" });
    expect(JSON.stringify(cuerpo)).not.toContain("101010101");
  });
});
