import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { registrarAuth, hashLlaveCaja, exigirPermisoFiscal, type DependenciasAuth } from "../src/plugins/auth.js";

const LLAVE_VALIDA = "caja-1-llave-secreta";

function dependencias(cambios: Partial<DependenciasAuth> = {}): DependenciasAuth {
  return {
    modo: "produccion",
    correosPermitidos: ["dueno@marohi.do"],
    verificarJwt: async (token) =>
      token === "jwt-dueno"
        ? { id: "u-1", correo: "Dueno@Marohi.do" }
        : token === "jwt-otro"
          ? { id: "u-2", correo: "otro@gmail.com" }
          : null,
    buscarCaja: async (hash) => (hash === hashLlaveCaja(LLAVE_VALIDA) ? { id: "caja-1", nombre: "Caja 1" } : null),
    ...cambios,
  };
}

async function servidor(deps: DependenciasAuth) {
  const app = Fastify();
  await app.register(async (protegido) => {
    registrarAuth(protegido, deps);
    protegido.get("/general", async (request) => ({ usuario: request.usuario }));
    await protegido.register(async (fiscal) => {
      fiscal.addHook("onRequest", exigirPermisoFiscal);
      fiscal.get("/fiscal/prueba", async () => ({ ok: true }));
    });
  });
  return app;
}

describe("autenticación del API", () => {
  it("sin credenciales responde 401", async () => {
    const app = await servidor(dependencias());
    expect((await app.inject({ url: "/general" })).statusCode).toBe(401);
  });

  it("una llave de caja válida entra, también a las rutas fiscales", async () => {
    const app = await servidor(dependencias());
    const general = await app.inject({ url: "/general", headers: { "x-caja-key": LLAVE_VALIDA } });
    expect(general.json().usuario).toMatchObject({ id: "caja-1", tipo: "caja" });
    const fiscal = await app.inject({ url: "/fiscal/prueba", headers: { "x-caja-key": LLAVE_VALIDA } });
    expect(fiscal.statusCode).toBe(200);
  });

  it("una llave de caja desconocida o revocada responde 401", async () => {
    const app = await servidor(dependencias());
    const res = await app.inject({ url: "/fiscal/prueba", headers: { "x-caja-key": "otra" } });
    expect(res.statusCode).toBe(401);
  });

  it("una llave de caja revocada no bloquea a quien también trae una sesión de Google válida", async () => {
    const app = await servidor(dependencias());
    const res = await app.inject({
      url: "/fiscal/prueba",
      headers: { "x-caja-key": "revocada", authorization: "Bearer jwt-dueno" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("un usuario de Google en la lista permitida entra a lo fiscal (sin distinguir mayúsculas)", async () => {
    const app = await servidor(dependencias());
    const res = await app.inject({ url: "/fiscal/prueba", headers: { authorization: "Bearer jwt-dueno" } });
    expect(res.statusCode).toBe(200);
  });

  it("un usuario de Google fuera de la lista no puede firmar comprobantes", async () => {
    const app = await servidor(dependencias());
    const fiscal = await app.inject({ url: "/fiscal/prueba", headers: { authorization: "Bearer jwt-otro" } });
    expect(fiscal.statusCode).toBe(403);
    const general = await app.inject({ url: "/general", headers: { authorization: "Bearer jwt-otro" } });
    expect(general.statusCode).toBe(200);
  });

  it("un JWT inválido responde 401", async () => {
    const app = await servidor(dependencias());
    const res = await app.inject({ url: "/general", headers: { authorization: "Bearer basura" } });
    expect(res.statusCode).toBe(401);
  });

  it("en modo desarrollo todo pasa como usuario local con permiso fiscal", async () => {
    const app = await servidor(dependencias({ modo: "desarrollo" }));
    const res = await app.inject({ url: "/fiscal/prueba" });
    expect(res.statusCode).toBe(200);
  });

  it("si falla la base al buscar la llave, responde 503 en vez de dejar pasar", async () => {
    const app = await servidor(
      dependencias({
        buscarCaja: async () => {
          throw new Error("sin conexión a Postgres");
        },
      }),
    );
    const res = await app.inject({ url: "/general", headers: { "x-caja-key": LLAVE_VALIDA } });
    expect(res.statusCode).toBe(503);
  });

  it("hashLlaveCaja es SHA-256 en hexadecimal", () => {
    expect(hashLlaveCaja("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
