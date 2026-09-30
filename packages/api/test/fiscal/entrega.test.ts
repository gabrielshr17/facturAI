import { describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { crearClienteContribuyente } from "../../src/fiscal/entrega.js";
import { rutasRecepcion } from "../../src/routes/recepcion.js";
import { crearAutenticadorReceptor } from "../../src/fiscal/recepcion/autenticacion.js";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { construirXmlAcecf } from "../../src/fiscal/xml/acecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { creditoFiscalPrueba } from "./datos-prueba.js";
import { crearAlmacenMemoria } from "./almacen-memoria.js";

const NOSOTROS = "131880738";
const COMPRADOR = "101010101";
const AHORA = new Date("2026-10-01T18:31:05.000Z");
const HOST = "https://comprador.do/testecf/servicio";

const certNuestro = () => cargarCertificado(certificadoPrueba(`RNC${NOSOTROS}`).p12, CLAVE_P12_PRUEBA);
const certComprador = () => cargarCertificado(certificadoPrueba(`RNC${COMPRADOR}`).p12, CLAVE_P12_PRUEBA);

async function compradorElectronico() {
  const { almacen, ecfs, aprobaciones } = crearAlmacenMemoria();
  const app = Fastify({ routerOptions: { caseSensitive: false } });
  await app.register(
    rutasRecepcion({
      receptor: { rncPropio: COMPRADOR, firmar: (xml) => firmarXml(xml, certComprador()) },
      almacen,
      autenticador: crearAutenticadorReceptor({ reloj: () => AHORA }),
      reloj: () => AHORA,
    }),
  );
  return { app, ecfs, aprobaciones };
}

function fetchHacia(app: FastifyInstance, solicitudes: string[] = []): typeof fetch {
  return async (entrada, init) => {
    const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    solicitudes.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.origin !== "https://comprador.do") throw new TypeError("fetch failed");
    const cuerpo = init?.body instanceof FormData ? new Response(init.body) : null;
    const res = await app.inject({
      method: (init?.method ?? "GET") as "GET" | "POST",
      url: url.pathname.replace("/testecf/servicio", ""),
      headers: {
        ...Object.fromEntries(new Headers(init?.headers).entries()),
        ...(cuerpo ? { "content-type": cuerpo.headers.get("content-type") ?? "" } : {}),
      },
      payload: cuerpo ? Buffer.from(await cuerpo.arrayBuffer()) : undefined,
    });
    return new Response(res.body, {
      status: res.statusCode,
      headers: { "content-type": res.headers["content-type"] as string },
    });
  };
}

function ecfNuestro() {
  return firmarXml(construirXmlEcf(creditoFiscalPrueba({ receptorDocumentoNumero: COMPRADOR }), AHORA), certNuestro());
}

describe("entrega a otro contribuyente electrónico", () => {
  const directorio = { urlRecepcion: HOST, urlAceptacion: HOST, urlAutenticacion: HOST };

  it("se autentica con la semilla, entrega el e-CF y devuelve el acuse del comprador", async () => {
    const { app, ecfs } = await compradorElectronico();
    const solicitudes: string[] = [];
    const cliente = crearClienteContribuyente({
      firmar: (xml) => firmarXml(xml, certNuestro()),
      fetch: fetchHacia(app, solicitudes),
    });

    const acuse = await cliente.entregarEcf(directorio, ecfNuestro(), "131880738E310000000001.xml");

    expect(solicitudes).toEqual([
      "GET /testecf/servicio/fe/autenticacion/api/semilla",
      "POST /testecf/servicio/fe/autenticacion/api/validacioncertificado",
      "POST /testecf/servicio/fe/recepcion/api/ecf",
    ]);
    expect(acuse).toMatchObject({ recibido: true });
    expect(acuse.xml).toContain("<ARECF>");
    expect(ecfs).toHaveLength(1);
  });

  it("sin servicio de autenticación declarado, entrega directo", async () => {
    const { app } = await compradorElectronico();
    const solicitudes: string[] = [];
    const cliente = crearClienteContribuyente({
      firmar: (xml) => firmarXml(xml, certNuestro()),
      fetch: fetchHacia(app, solicitudes),
    });

    await cliente.entregarEcf({ ...directorio, urlAutenticacion: null }, ecfNuestro(), "a.xml");

    expect(solicitudes).toEqual(["POST /testecf/servicio/fe/recepcion/api/ecf"]);
  });

  it("reporta el motivo cuando el comprador acusa no recibido", async () => {
    const { app } = await compradorElectronico();
    const cliente = crearClienteContribuyente({
      firmar: (xml) => firmarXml(xml, certNuestro()),
      fetch: fetchHacia(app),
    });
    const aOtro = firmarXml(
      construirXmlEcf(creditoFiscalPrueba({ receptorDocumentoNumero: "130000002" }), AHORA),
      certNuestro(),
    );

    expect(await cliente.entregarEcf(directorio, aOtro, "a.xml")).toMatchObject({ recibido: false, motivo: 4 });
  });

  it("entrega una aprobación comercial al emisor", async () => {
    const { app, aprobaciones } = await compradorElectronico();
    const cliente = crearClienteContribuyente({
      firmar: (xml) => firmarXml(xml, certNuestro()),
      fetch: fetchHacia(app),
    });
    const acecf = firmarXml(
      construirXmlAcecf(
        {
          rncEmisor: COMPRADOR,
          encf: "E310000000009",
          fechaEmision: "01-10-2026",
          montoTotal: 50,
          rncComprador: NOSOTROS,
          aprobado: true,
        },
        AHORA,
      ),
      certNuestro(),
    );

    expect(await cliente.entregarAprobacion(directorio, acecf, "a.xml")).toEqual({ entregada: true });
    expect(aprobaciones).toHaveLength(1);
  });

  it("un comprador caído es un error de red, no un acuse", async () => {
    const cliente = crearClienteContribuyente({
      firmar: (xml) => firmarXml(xml, certNuestro()),
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(cliente.entregarEcf(directorio, ecfNuestro(), "a.xml")).rejects.toThrow(/No se pudo contactar/);
  });
});
