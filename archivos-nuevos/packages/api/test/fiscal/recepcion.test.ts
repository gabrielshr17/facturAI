import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import { rutasRecepcion } from "../../src/routes/recepcion.js";
import { crearAutenticadorReceptor } from "../../src/fiscal/recepcion/autenticacion.js";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { construirXmlAcecf } from "../../src/fiscal/xml/acecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { verificarDocumentoFirmado } from "../../src/fiscal/verificacion.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { creditoFiscalPrueba, EMISOR_PRUEBA } from "./datos-prueba.js";
import { crearAlmacenMemoria } from "./almacen-memoria.js";

const NOSOTROS = "131880738";
const PROVEEDOR = "101010101";
const AHORA = new Date("2026-10-01T18:31:05.000Z");

const certNuestro = () => cargarCertificado(certificadoPrueba(`RNC${NOSOTROS}`).p12, CLAVE_P12_PRUEBA);
const certProveedor = () => cargarCertificado(certificadoPrueba(`RNC${PROVEEDOR}`).p12, CLAVE_P12_PRUEBA);

function ecfDelProveedor(rncComprador = NOSOTROS, ncf = "E310000000007"): string {
  const doc = creditoFiscalPrueba({
    ncf,
    emisor: { ...EMISOR_PRUEBA, rnc: PROVEEDOR, razonSocial: "PROVEEDOR EJEMPLO SRL" },
    receptorDocumentoNumero: rncComprador,
    receptorNombre: "SUPLIDORA MAROHI SRL",
  });
  return firmarXml(construirXmlEcf(doc, AHORA), certProveedor());
}

function multipart(xml: string, extra: Record<string, string> = {}) {
  const limite = "----limite123";
  const cuerpo =
    `--${limite}\r\nContent-Disposition: form-data; name="xml"; filename="archivo.xml"\r\n` +
    `Content-Type: text/xml\r\n\r\n${xml}\r\n--${limite}--\r\n`;
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}`, ...extra } };
}

async function servidor(disponible = true) {
  const { almacen, ecfs, aprobaciones } = crearAlmacenMemoria();
  const app = Fastify({ routerOptions: { caseSensitive: false } });
  await app.register(
    rutasRecepcion({
      receptor: disponible ? { rncPropio: NOSOTROS, firmar: (xml) => firmarXml(xml, certNuestro()) } : null,
      almacen,
      autenticador: crearAutenticadorReceptor({ reloj: () => AHORA }),
      reloj: () => AHORA,
    }),
  );
  return { app, ecfs, aprobaciones };
}

function valor(xml: string, etiqueta: string) {
  return new RegExp(`<${etiqueta}>([^<]*)</${etiqueta}>`).exec(xml)?.[1];
}

describe("servicio de recepción de e-CF (/fe/recepcion/api/ecf)", () => {
  it("guarda el e-CF y responde un acuse de recibo firmado por nosotros", async () => {
    const { app, ecfs } = await servidor();
    const res = await app.inject({ method: "POST", url: "/fe/recepcion/api/ecf", ...multipart(ecfDelProveedor()) });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("xml");
    expect(valor(res.body, "Estado")).toBe("0");
    expect(valor(res.body, "RNCEmisor")).toBe(PROVEEDOR);
    expect(valor(res.body, "RNCComprador")).toBe(NOSOTROS);
    expect(verificarDocumentoFirmado(res.body, NOSOTROS)).toEqual({ valido: true });
    expect(ecfs).toHaveLength(1);
    expect(ecfs[0]).toMatchObject({ encf: "E310000000007", rncEmisor: PROVEEDOR, montoTotal: 286 });
    expect(ecfs[0]?.xml).toContain("<SignatureValue>");
    expect(ecfs[0]?.acuseXml).toBe(res.body);
  });

  it("es insensible a mayúsculas en la ruta", async () => {
    const { app } = await servidor();
    const res = await app.inject({ method: "POST", url: "/FE/Recepcion/API/ECF", ...multipart(ecfDelProveedor()) });
    expect(res.statusCode).toBe(200);
  });

  it("acusa no recibido por RNC comprador que no corresponde (motivo 4)", async () => {
    const { app, ecfs } = await servidor();
    const res = await app.inject({
      method: "POST",
      url: "/fe/recepcion/api/ecf",
      ...multipart(ecfDelProveedor("130000002")),
    });
    expect(valor(res.body, "Estado")).toBe("1");
    expect(valor(res.body, "CodigoMotivoNoRecibido")).toBe("4");
    expect(ecfs).toHaveLength(0);
  });

  it("acusa no recibido por firma inválida (motivo 2)", async () => {
    const { app } = await servidor();
    const alterado = ecfDelProveedor().replace("<MontoTotal>286.00", "<MontoTotal>1.00");
    const res = await app.inject({ method: "POST", url: "/fe/recepcion/api/ecf", ...multipart(alterado) });
    expect(valor(res.body, "CodigoMotivoNoRecibido")).toBe("2");
  });

  it("acusa envío duplicado (motivo 3)", async () => {
    const { app } = await servidor();
    await app.inject({ method: "POST", url: "/fe/recepcion/api/ecf", ...multipart(ecfDelProveedor()) });
    const res = await app.inject({ method: "POST", url: "/fe/recepcion/api/ecf", ...multipart(ecfDelProveedor()) });
    expect(valor(res.body, "CodigoMotivoNoRecibido")).toBe("3");
  });

  it("un archivo que no es un e-CF responde 400", async () => {
    const { app } = await servidor();
    const res = await app.inject({ method: "POST", url: "/fe/recepcion/api/ecf", ...multipart("<Otra/>") });
    expect(res.statusCode).toBe(400);
  });

  it("sin certificado configurado responde 503", async () => {
    const { app } = await servidor(false);
    const res = await app.inject({ method: "POST", url: "/fe/recepcion/api/ecf", ...multipart(ecfDelProveedor()) });
    expect(res.statusCode).toBe(503);
  });

  it("un token inválido responde 401", async () => {
    const { app } = await servidor();
    const res = await app.inject({
      method: "POST",
      url: "/fe/recepcion/api/ecf",
      ...multipart(ecfDelProveedor(), { authorization: "Bearer inventado" }),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("servicio de aprobación comercial (/fe/aprobacioncomercial/api/ecf)", () => {
  function aprobacionDelComprador(rncEmisor = NOSOTROS) {
    const xml = construirXmlAcecf(
      {
        rncEmisor,
        encf: "E310000000001",
        fechaEmision: "01-10-2026",
        montoTotal: 286,
        rncComprador: PROVEEDOR,
        aprobado: false,
        motivoRechazo: "Precio incorrecto",
      },
      AHORA,
    );
    return firmarXml(xml, certProveedor());
  }

  it("guarda la aprobación de un e-CF nuestro y responde 200", async () => {
    const { app, aprobaciones } = await servidor();
    const res = await app.inject({
      method: "POST",
      url: "/fe/aprobacioncomercial/api/ecf",
      ...multipart(aprobacionDelComprador()),
    });
    expect(res.statusCode).toBe(200);
    expect(aprobaciones).toEqual([
      expect.objectContaining({
        rncEmisor: NOSOTROS,
        rncComprador: PROVEEDOR,
        encf: "E310000000001",
        aprobado: false,
        motivo: "Precio incorrecto",
      }),
    ]);
  });

  it("rechaza con 400 una aprobación de un e-CF que no emitimos o mal firmada", async () => {
    const { app, aprobaciones } = await servidor();
    const ajena = await app.inject({
      method: "POST",
      url: "/fe/aprobacioncomercial/api/ecf",
      ...multipart(aprobacionDelComprador("130000002")),
    });
    expect(ajena.statusCode).toBe(400);
    const alterada = aprobacionDelComprador().replace("Precio incorrecto", "Otro motivo");
    const mala = await app.inject({ method: "POST", url: "/fe/aprobacioncomercial/api/ecf", ...multipart(alterada) });
    expect(mala.statusCode).toBe(400);
    expect(aprobaciones).toHaveLength(0);
  });
});

describe("autenticación del receptor (/fe/autenticacion/api/*)", () => {
  it("entrega una semilla, valida la semilla firmada y el token sirve para enviar", async () => {
    const { app } = await servidor();
    const semilla = await app.inject({ url: "/fe/autenticacion/api/semilla" });
    expect(semilla.statusCode).toBe(200);
    expect(semilla.body).toContain("<SemillaModel");

    const validacion = await app.inject({
      method: "POST",
      url: "/fe/autenticacion/api/validacioncertificado",
      ...multipart(firmarXml(semilla.body, certProveedor())),
    });
    expect(validacion.statusCode).toBe(200);
    const { token, expira } = validacion.json<{ token: string; expira: string }>();
    expect(new Date(expira).getTime()).toBeGreaterThan(AHORA.getTime());

    const res = await app.inject({
      method: "POST",
      url: "/fe/recepcion/api/ecf",
      ...multipart(ecfDelProveedor(), { authorization: `Bearer ${token}` }),
    });
    expect(res.statusCode).toBe(200);
  });

  it("no acepta una semilla inventada ni reutilizada", async () => {
    const { app } = await servidor();
    const inventada = firmarXml(
      '<?xml version="1.0" encoding="utf-8"?><SemillaModel><valor>x</valor><fecha>2026-10-01T14:31:05-04:00</fecha></SemillaModel>',
      certProveedor(),
    );
    const r1 = await app.inject({
      method: "POST",
      url: "/fe/autenticacion/api/validacioncertificado",
      ...multipart(inventada),
    });
    expect(r1.statusCode).toBe(400);

    const semilla = (await app.inject({ url: "/fe/autenticacion/api/semilla" })).body;
    const firmada = firmarXml(semilla, certProveedor());
    await app.inject({ method: "POST", url: "/fe/autenticacion/api/validacioncertificado", ...multipart(firmada) });
    const repetida = await app.inject({
      method: "POST",
      url: "/fe/autenticacion/api/validacioncertificado",
      ...multipart(firmada),
    });
    expect(repetida.statusCode).toBe(400);
  });
});

describe("recepción con autoridades certificadoras configuradas", () => {
  it("acusa firma inválida (motivo 2) a un e-CF firmado con certificado autofirmado", async () => {
    const { almacen, ecfs } = crearAlmacenMemoria();
    const app = Fastify({ routerOptions: { caseSensitive: false } });
    await app.register(
      rutasRecepcion({
        receptor: { rncPropio: NOSOTROS, firmar: (xml) => firmarXml(xml, certNuestro()) },
        almacen,
        autenticador: crearAutenticadorReceptor({ reloj: () => AHORA }),
        raices: [certificadoPrueba("RAIZ-DE-CONFIANZA").certificadoPem],
        reloj: () => AHORA,
      }),
    );
    const res = await app.inject({ method: "POST", url: "/fe/recepcion/api/ecf", ...multipart(ecfDelProveedor()) });
    expect(valor(res.body, "CodigoMotivoNoRecibido")).toBe("2");
    expect(ecfs).toHaveLength(0);
  });
});
