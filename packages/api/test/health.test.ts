import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { rutaSalud } from "../src/routes/health.js";
import type { ModuloFiscal } from "../src/fiscal/iniciar.js";

describe("GET /health", () => {
  it("informa si la facturación electrónica está activa y en qué ambiente", async () => {
    const app = Fastify();
    const modulo: ModuloFiscal = { disponible: false, ambiente: "testecf", motivo: "Falta el certificado." };
    await app.register(rutaSalud(modulo));
    const cuerpo = (await app.inject({ url: "/health" })).json();
    expect(cuerpo).toMatchObject({ estado: "ok", fiscal: { disponible: false, ambiente: "testecf" } });
    expect(JSON.stringify(cuerpo)).not.toContain("certificado");
  });
});
