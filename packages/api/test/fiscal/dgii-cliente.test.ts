import { describe, expect, it } from "vitest";
import { SignedXml } from "xml-crypto";
import { DOMParser } from "@xmldom/xmldom";
import { crearClienteDgii } from "../../src/fiscal/dgii-cliente.js";
import { cargarCertificado } from "../../src/fiscal/firma.js";
import { DgiiNoDisponibleError, DgiiRespuestaError } from "../../src/fiscal/errores.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { crearDgiiFalsa, json } from "./dgii-falso.js";

const AHORA = new Date("2026-10-01T18:31:00Z");

function cliente(dgii: ReturnType<typeof crearDgiiFalsa>, reloj: () => Date = () => AHORA) {
  return crearClienteDgii({
    ambiente: "testecf",
    certificado: cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA),
    fetch: dgii.fetch,
    reloj,
  });
}

describe("cliente DGII — autenticación", () => {
  it("firma la semilla con el certificado y usa el token recibido", async () => {
    const dgii = crearDgiiFalsa({ "recepcion/api/facturaselectronicas": () => json({ trackId: "track-1" }) });

    await cliente(dgii).enviarEcf("<ECF/>", "131880738E310000000001.xml");

    const [semilla, validar, envio] = dgii.solicitudes;
    expect(semilla?.url).toBe("https://ecf.dgii.gov.do/testecf/autenticacion/api/autenticacion/semilla");
    expect(validar?.metodo).toBe("POST");
    expect(validar?.archivo?.contenido).toContain("<valor>semilla-123</valor>");

    const firmada = validar!.archivo!.contenido;
    const doc = new DOMParser().parseFromString(firmada, "text/xml");
    const firma = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    const verificador = new SignedXml({ publicCert: certificadoPrueba().certificadoPem });
    verificador.loadSignature(firma as unknown as Element);
    expect(verificador.checkSignature(firmada)).toBe(true);

    expect(envio?.autorizacion).toBe("Bearer token-1");
  });

  it("reutiliza el token mientras no expire", async () => {
    const dgii = crearDgiiFalsa({ "recepcion/api/facturaselectronicas": () => json({ trackId: "t" }) });
    const c = cliente(dgii);

    await c.enviarEcf("<ECF/>", "a.xml");
    await c.enviarEcf("<ECF/>", "b.xml");

    expect(dgii.solicitudes.filter((s) => s.url.includes("validarsemilla")).length).toBe(1);
    expect(dgii.solicitudes.at(-1)?.autorizacion).toBe("Bearer token-1");
  });

  it("pide un token nuevo cuando el anterior está por expirar", async () => {
    let ahora = AHORA;
    const dgii = crearDgiiFalsa({ "recepcion/api/facturaselectronicas": () => json({ trackId: "t" }) });
    const c = cliente(dgii, () => ahora);

    await c.enviarEcf("<ECF/>", "a.xml");
    ahora = new Date("2026-10-01T19:29:30Z");
    await c.enviarEcf("<ECF/>", "b.xml");

    expect(dgii.solicitudes.at(-1)?.autorizacion).toBe("Bearer token-2");
  });

  it("si la DGII responde 401, renueva el token y reintenta una vez", async () => {
    let intentos = 0;
    const dgii = crearDgiiFalsa({
      "recepcion/api/facturaselectronicas": () => {
        intentos += 1;
        return intentos === 1 ? new Response("", { status: 401 }) : json({ trackId: "track-ok" });
      },
    });

    const resultado = await cliente(dgii).enviarEcf("<ECF/>", "a.xml");

    expect(resultado.trackId).toBe("track-ok");
    expect(dgii.solicitudes.at(-1)?.autorizacion).toBe("Bearer token-2");
  });
});

describe("cliente DGII — recepción y consultas", () => {
  it("envía el e-CF como archivo multipart con el nombre indicado y devuelve el trackId", async () => {
    const dgii = crearDgiiFalsa({ "recepcion/api/facturaselectronicas": () => json({ trackId: "track-9" }) });

    const resultado = await cliente(dgii).enviarEcf("<ECF>firmado</ECF>", "131880738E310000000001.xml");

    const envio = dgii.solicitudes.at(-1)!;
    expect(envio.url).toBe("https://ecf.dgii.gov.do/testecf/recepcion/api/facturaselectronicas");
    expect(envio.archivo).toEqual({ nombre: "131880738E310000000001.xml", contenido: "<ECF>firmado</ECF>" });
    expect(resultado.trackId).toBe("track-9");
  });

  it("un envío sin trackId es un error de la DGII con su mensaje", async () => {
    const dgii = crearDgiiFalsa({
      "recepcion/api/facturaselectronicas": () => json({ error: "XML inválido", mensaje: "Estructura" }),
    });
    await expect(cliente(dgii).enviarEcf("<ECF/>", "a.xml")).rejects.toThrow(/XML inválido/);
  });

  it("envía el RFCE a fc.dgii.gov.do y traduce el estado", async () => {
    const dgii = crearDgiiFalsa({
      "recepcionfc/api/recepcion/ecf": () =>
        json({
          codigo: 4,
          estado: "Aceptado Condicional",
          mensajes: [{ codigo: "A1", valor: "Diferencia de redondeo" }],
          encf: "E320000000001",
          secuenciaUtilizada: true,
        }),
    });

    const resultado = await cliente(dgii).enviarRfce("<RFCE/>", "131880738E320000000001.xml");

    expect(dgii.solicitudes.at(-1)?.url).toBe("https://fc.dgii.gov.do/testecf/recepcionfc/api/recepcion/ecf");
    expect(resultado).toEqual({
      estado: "aceptado_condicional",
      mensajes: ["A1: Diferencia de redondeo"],
      secuenciaUtilizada: true,
    });
  });

  it("consulta el resultado por trackId", async () => {
    const dgii = crearDgiiFalsa({
      "consultaresultado/api/consultas/estado": () =>
        json({
          trackId: "t-1",
          codigo: 2,
          estado: "Rechazado",
          mensajes: [{ valor: "RNC comprador inválido", codigo: 12 }],
        }),
    });

    const resultado = await cliente(dgii).consultarResultado("t-1");

    expect(dgii.solicitudes.at(-1)?.url).toBe(
      "https://ecf.dgii.gov.do/testecf/consultaresultado/api/consultas/estado?trackid=t-1",
    );
    expect(resultado).toEqual({
      estado: "rechazado",
      mensajes: ["12: RNC comprador inválido"],
      secuenciaUtilizada: false,
    });
  });

  it("una respuesta de estado que no se entiende falla en vez de inventar un estado", async () => {
    const dgii = crearDgiiFalsa({ consultaresultado: () => json({ cosa: "rara" }) });
    await expect(cliente(dgii).consultarResultado("t")).rejects.toThrow(/no se pudo interpretar/);
  });

  it("traduce 'En Proceso' y 'No encontrado'", async () => {
    let codigo = 3;
    const dgii = crearDgiiFalsa({ consultaresultado: () => json({ codigo, estado: "x", mensajes: [] }) });
    const c = cliente(dgii);

    expect((await c.consultarResultado("t")).estado).toBe("en_proceso");
    codigo = 0;
    expect((await c.consultarResultado("t")).estado).toBe("no_encontrado");
  });

  it("envía la anulación de rangos y devuelve el mensaje de la DGII", async () => {
    const dgii = crearDgiiFalsa({
      "anulacionrangos/api/operaciones/anularrango": () =>
        json({
          rnc: "131880738",
          codigo: "1",
          nombre: "Aceptado",
          mensajes: ["Las secuencias fueron anuladas correctamente."],
        }),
    });

    const resultado = await cliente(dgii).anularRangos("<ANECF/>", "131880738.xml");

    expect(resultado).toEqual({ aceptada: true, mensajes: ["Las secuencias fueron anuladas correctamente."] });
  });
});

describe("cliente DGII — fallas", () => {
  it("una falla de red es DgiiNoDisponibleError", async () => {
    const c = crearClienteDgii({
      ambiente: "testecf",
      certificado: cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA),
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
      reloj: () => AHORA,
    });
    await expect(c.enviarEcf("<ECF/>", "a.xml")).rejects.toBeInstanceOf(DgiiNoDisponibleError);
  });

  it("un 5xx de la DGII es DgiiNoDisponibleError", async () => {
    const dgii = crearDgiiFalsa({ "recepcion/api": () => new Response("caído", { status: 503 }) });
    await expect(cliente(dgii).enviarEcf("<ECF/>", "a.xml")).rejects.toBeInstanceOf(DgiiNoDisponibleError);
  });

  it("un 4xx de la DGII es DgiiRespuestaError con el cuerpo", async () => {
    const dgii = crearDgiiFalsa({ "recepcion/api": () => new Response("archivo inválido", { status: 400 }) });
    const error = await cliente(dgii)
      .enviarEcf("<ECF/>", "a.xml")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DgiiRespuestaError);
    expect((error as DgiiRespuestaError).cuerpo).toBe("archivo inválido");
  });
});
