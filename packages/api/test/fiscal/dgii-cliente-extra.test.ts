import { describe, expect, it } from "vitest";
import { crearClienteDgii } from "../../src/fiscal/dgii-cliente.js";
import { cargarCertificado } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { crearDgiiFalsa, json } from "./dgii-falso.js";

function cliente(dgii: ReturnType<typeof crearDgiiFalsa>) {
  return crearClienteDgii({
    ambiente: "testecf",
    certificado: cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA),
    fetch: dgii.fetch,
    reloj: () => new Date("2026-10-01T18:31:00Z"),
  });
}

describe("cliente DGII — aprobación comercial, directorio y trackIds", () => {
  it("envía la aprobación comercial y reporta si la DGII la validó", async () => {
    const dgii = crearDgiiFalsa({
      "aprobacioncomercial/api/aprobacioncomercial": () => json({ mensaje: ["OK"], estado: "Aprobado", codigo: "1" }),
    });
    const r = await cliente(dgii).enviarAprobacionComercial("<ACECF/>", "131880738E310000000007.xml");
    expect(dgii.solicitudes.at(-1)?.url).toBe(
      "https://ecf.dgii.gov.do/testecf/aprobacioncomercial/api/aprobacioncomercial",
    );
    expect(dgii.solicitudes.at(-1)?.archivo?.nombre).toBe("131880738E310000000007.xml");
    expect(r).toEqual({ aceptada: true, mensajes: ["OK"] });
  });

  it("una aprobación comercial rechazada devuelve el mensaje", async () => {
    const dgii = crearDgiiFalsa({
      "aprobacioncomercial/api": () => json({ mensaje: ["e-CF no encontrado"], estado: "Rechazado", codigo: "2" }),
    });
    expect(await cliente(dgii).enviarAprobacionComercial("<ACECF/>", "a.xml")).toEqual({
      aceptada: false,
      mensajes: ["e-CF no encontrado"],
    });
  });

  it("consulta el directorio de un RNC electrónico", async () => {
    const dgii = crearDgiiFalsa({
      "consultadirectorio/api/consultas/obtenerdirectorioporrnc": () =>
        json([
          {
            nombre: "FERRETERIA EJEMPLO SRL",
            rnc: "101010101",
            urlRecepcion: "https://ferreteria.do/fe",
            urlAceptacion: "https://ferreteria.do/fe",
            urlOpcional: "https://ferreteria.do/fe",
          },
        ]),
    });
    const r = await cliente(dgii).consultarDirectorio("101010101");
    expect(dgii.solicitudes.at(-1)?.url).toBe(
      "https://ecf.dgii.gov.do/testecf/consultadirectorio/api/consultas/obtenerdirectorioporrnc?rnc=101010101",
    );
    expect(r).toEqual({
      urlRecepcion: "https://ferreteria.do/fe",
      urlAceptacion: "https://ferreteria.do/fe",
      urlAutenticacion: "https://ferreteria.do/fe",
    });
  });

  it("un RNC que no es electrónico no tiene directorio", async () => {
    const dgii = crearDgiiFalsa({ obtenerdirectorioporrnc: () => new Response("", { status: 404 }) });
    expect(await cliente(dgii).consultarDirectorio("101010101")).toBeNull();
    const vacio = crearDgiiFalsa({ obtenerdirectorioporrnc: () => json([]) });
    expect(await cliente(vacio).consultarDirectorio("101010101")).toBeNull();
  });

  it("consulta los trackIds que la DGII tiene para un e-NCF", async () => {
    const dgii = crearDgiiFalsa({
      "consultatrackids/api/trackids/consulta": () =>
        json([{ trackId: "t-1", estado: "Aceptado", fechaRecepcion: "2026-10-01T14:31:00" }]),
    });
    const r = await cliente(dgii).consultarTrackIds("131880738", "E310000000001");
    expect(dgii.solicitudes.at(-1)?.url).toBe(
      "https://ecf.dgii.gov.do/testecf/consultatrackids/api/trackids/consulta?rncemisor=131880738&encf=E310000000001",
    );
    expect(r).toEqual([{ trackId: "t-1", estado: "aceptado" }]);
  });

  it("sin registros de ese e-NCF devuelve lista vacía", async () => {
    const dgii = crearDgiiFalsa({ consultatrackids: () => json([{ trackId: null, estado: "No encontrado" }]) });
    expect(await cliente(dgii).consultarTrackIds("131880738", "E310000000001")).toEqual([]);
  });
});

describe("cliente DGII — consulta de estado de un e-CF (rol receptor)", () => {
  it("consulta por RNC emisor, e-NCF, RNC comprador y código de seguridad", async () => {
    const dgii = crearDgiiFalsa({
      "consultaestado/api/consultas/estado": () =>
        json({
          codigo: 1,
          estado: "Aceptado",
          rncEmisor: "101010101",
          ncfElectronico: "E310000000007",
          montoTotal: 1180,
        }),
    });
    const r = await cliente(dgii).consultarEstadoEcf("101010101", "E310000000007", "131880738", "AbC+12");
    expect(dgii.solicitudes.at(-1)?.url).toBe(
      "https://ecf.dgii.gov.do/testecf/consultaestado/api/consultas/estado?rncemisor=101010101" +
        "&ncfelectronico=E310000000007&rnccomprador=131880738&codigoseguridad=AbC%2B12",
    );
    expect(r).toEqual({ estado: "aceptado", montoTotal: 1180 });
  });

  it("un e-CF desconocido para la DGII es no_encontrado", async () => {
    const dgii = crearDgiiFalsa({ consultaestado: () => json({ codigo: 0, estado: "No encontrado" }) });
    expect(await cliente(dgii).consultarEstadoEcf("1", "E310000000007", "2", "x")).toEqual({
      estado: "no_encontrado",
      montoTotal: null,
    });
  });
});
