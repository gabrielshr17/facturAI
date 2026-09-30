import { describe, expect, it } from "vitest";
import { crearServicioEmision } from "../../src/fiscal/servicio-emision.js";
import { crearClienteDgii } from "../../src/fiscal/dgii-cliente.js";
import { cargarCertificado } from "../../src/fiscal/firma.js";
import { DgiiNoDisponibleError, DocumentoFiscalInvalidoError } from "../../src/fiscal/errores.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { crearDgiiFalsa, json, type Respondedor } from "./dgii-falso.js";
import { consumoPrueba, creditoFiscalPrueba } from "./datos-prueba.js";

const FIRMA = new Date("2026-10-01T18:31:05Z");

function servicio(rutas: Record<string, Respondedor>) {
  const dgii = crearDgiiFalsa(rutas);
  const certificado = cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA);
  const reloj = () => FIRMA;
  const cliente = crearClienteDgii({ ambiente: "testecf", certificado, fetch: dgii.fetch, reloj });
  return { dgii, servicio: crearServicioEmision({ ambiente: "testecf", certificado, cliente, reloj }) };
}

function envios(dgii: ReturnType<typeof crearDgiiFalsa>) {
  return dgii.solicitudes.filter((s) => !s.url.includes("autenticacion"));
}

const VENTA_GRANDE = {
  lineas: [
    { descripcion: "Planta eléctrica", cantidad: 1, precioUnitario: 300000, tasaImpuesto: 0.18, subtotal: 300000 },
  ],
  pagos: [{ metodo: "transferencia" as const, monto: 300000 }],
  montoGravado: 254237.29,
  montoExento: 0,
  montoItbis: 45762.71,
  total: 300000,
};

describe("servicio de emisión — consumo menor a RD$250,000 (RFCE)", () => {
  it("envía solo el resumen firmado y conserva el e-CF completo firmado", async () => {
    const { dgii, servicio: s } = servicio({
      "recepcionfc/api/recepcion/ecf": () =>
        json({ codigo: 1, estado: "Aceptado", mensajes: [], secuenciaUtilizada: true }),
    });

    const resultado = await s.emitir(consumoPrueba());

    const [envio, ...otros] = envios(dgii);
    expect(otros).toEqual([]);
    expect(envio?.url).toContain("fc.dgii.gov.do/testecf/recepcionfc");
    expect(envio?.archivo?.nombre).toBe("131880738E320000000001.xml");
    expect(envio?.archivo?.contenido).toMatch(/^<\?xml[^>]*\?><RFCE>/);
    expect(envio?.archivo?.contenido).toContain(
      `<CodigoSeguridadeCF>${resultado.codigoSeguridad}</CodigoSeguridadeCF>`,
    );
    expect(envio?.archivo?.contenido).toContain("<SignatureValue>");

    expect(resultado.estado).toBe("aceptado");
    expect(resultado.trackId).toBeUndefined();
    expect(resultado.xmlFirmado).toMatch(/<ECF>.*<DetallesItems>.*<SignatureValue>/s);
    expect(resultado.fechaFirma).toBe("01-10-2026 14:31:05");
    expect(resultado.qrUrl).toBe(
      "https://fc.dgii.gov.do/testecf/consultatimbrefc?rncemisor=131880738&encf=E320000000001" +
        `&montototal=286.00&codigoseguridad=${encodeURIComponent(resultado.codigoSeguridad!)}`,
    );
  });

  it("un RFCE rechazado devuelve el motivo de la DGII", async () => {
    const { servicio: s } = servicio({
      "recepcionfc/api/recepcion/ecf": () =>
        json({ codigo: 2, estado: "Rechazado", mensajes: [{ codigo: "145", valor: "Secuencia vencida" }] }),
    });

    const resultado = await s.emitir(consumoPrueba());

    expect(resultado.estado).toBe("rechazado");
    expect(resultado.motivoRechazo).toBe("145: Secuencia vencida");
  });
});

describe("servicio de emisión — e-CF completo (E31 y consumo ≥ RD$250,000)", () => {
  it("envía el E31 a recepción y consulta el resultado por trackId", async () => {
    const { dgii, servicio: s } = servicio({
      "recepcion/api/facturaselectronicas": () => json({ trackId: "track-31" }),
      "consultaresultado/api/consultas/estado": () => json({ codigo: 1, estado: "Aceptado", mensajes: [] }),
    });

    const resultado = await s.emitir(creditoFiscalPrueba());

    const [envio, consulta] = envios(dgii);
    expect(envio?.url).toBe("https://ecf.dgii.gov.do/testecf/recepcion/api/facturaselectronicas");
    expect(envio?.archivo?.nombre).toBe("131880738E310000000001.xml");
    expect(envio?.archivo?.contenido).toBe(resultado.xmlFirmado);
    expect(consulta?.url).toContain("trackid=track-31");
    expect(resultado.estado).toBe("aceptado");
    expect(resultado.trackId).toBe("track-31");
    expect(resultado.qrUrl).toBe(
      "https://ecf.dgii.gov.do/testecf/consultatimbre?rncemisor=131880738&rnccomprador=101010101" +
        "&encf=E310000000001&fechaemision=01-10-2026&montototal=286.00&fechafirma=01-10-2026%2014:31:05" +
        `&codigoseguridad=${encodeURIComponent(resultado.codigoSeguridad!)}`,
    );
  });

  it("queda en proceso si la DGII aún no valida o la consulta falla", async () => {
    const { servicio: s } = servicio({
      "recepcion/api/facturaselectronicas": () => json({ trackId: "track-lento" }),
      "consultaresultado/api/consultas/estado": () => new Response("", { status: 503 }),
    });

    const resultado = await s.emitir(creditoFiscalPrueba());

    expect(resultado.estado).toBe("en_proceso");
    expect(resultado.trackId).toBe("track-lento");
  });

  it("una vez asignado el trackId, cualquier falla de la consulta deja el e-CF en proceso", async () => {
    const { servicio: s } = servicio({
      "recepcion/api/facturaselectronicas": () => json({ trackId: "track-recibido" }),
      "consultaresultado/api/consultas/estado": () => new Response("token vencido", { status: 401 }),
    });

    const resultado = await s.emitir(creditoFiscalPrueba());

    expect(resultado.estado).toBe("en_proceso");
    expect(resultado.trackId).toBe("track-recibido");
  });

  it("un consumo de RD$250,000 o más va completo y exige documento del comprador", async () => {
    const { dgii, servicio: s } = servicio({
      "recepcion/api/facturaselectronicas": () => json({ trackId: "track-32" }),
      "consultaresultado/api/consultas/estado": () => json({ codigo: 3, estado: "En Proceso", mensajes: [] }),
    });

    await expect(s.emitir(consumoPrueba(VENTA_GRANDE))).rejects.toBeInstanceOf(DocumentoFiscalInvalidoError);
    expect(envios(dgii)).toEqual([]);

    const resultado = await s.emitir(
      consumoPrueba({ ...VENTA_GRANDE, receptorDocumentoTipo: "rnc", receptorDocumentoNumero: "101010101" }),
    );
    expect(envios(dgii)[0]?.url).toContain("recepcion/api/facturaselectronicas");
    expect(resultado.estado).toBe("en_proceso");
  });

  it("propaga DgiiNoDisponibleError cuando la DGII no responde", async () => {
    const { servicio: s } = servicio({ "recepcion/api/facturaselectronicas": () => new Response("", { status: 502 }) });
    await expect(s.emitir(creditoFiscalPrueba())).rejects.toBeInstanceOf(DgiiNoDisponibleError);
  });
});

describe("servicio de emisión — consulta y anulación", () => {
  it("consulta un trackId pendiente", async () => {
    const { servicio: s } = servicio({
      "consultaresultado/api/consultas/estado": () =>
        json({ codigo: 2, estado: "Rechazado", mensajes: [{ codigo: 7, valor: "Monto no cuadra" }] }),
    });

    expect(await s.consultar("track-1")).toEqual({ estado: "rechazado", motivoRechazo: "7: Monto no cuadra" });
  });

  it("firma y envía la anulación de e-NCF", async () => {
    const { dgii, servicio: s } = servicio({
      "anulacionrangos/api/operaciones/anularrango": () => json({ codigo: "1", nombre: "Aceptado", mensajes: ["ok"] }),
    });

    const resultado = await s.anular("131880738", [{ tipoEcf: "32", desde: "E320000000005", hasta: "E320000000005" }]);

    const envio = envios(dgii)[0];
    expect(envio?.archivo?.contenido).toMatch(/<ANECF>.*<SignatureValue>/s);
    expect(envio?.archivo?.nombre).toBe("131880738E320000000005.xml");
    expect(resultado).toEqual({ aceptada: true, mensajes: ["ok"] });
  });
});
