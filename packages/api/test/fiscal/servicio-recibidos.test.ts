import { describe, expect, it } from "vitest";
import { crearServicioRecibidos } from "../../src/fiscal/servicio-recibidos.js";
import type { ClienteContribuyente } from "../../src/fiscal/entrega.js";
import type { DirectorioContribuyente } from "../../src/fiscal/dgii-cliente.js";
import { DocumentoFiscalInvalidoError } from "../../src/fiscal/errores.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { verificarDocumentoFirmado } from "../../src/fiscal/verificacion.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { crearAlmacenMemoria } from "./almacen-memoria.js";

const NOSOTROS = "131880738";
const PROVEEDOR = "101010101";
const AHORA = new Date("2026-10-01T18:31:05.000Z");
const DIRECTORIO: DirectorioContribuyente = {
  urlRecepcion: "https://proveedor.do/fe",
  urlAceptacion: "https://proveedor.do/fe",
  urlAutenticacion: null,
};

async function preparar(opciones: { directorio?: DirectorioContribuyente | null; dgiiAcepta?: boolean } = {}) {
  const { almacen, ecfs } = crearAlmacenMemoria();
  await almacen.guardarEcf({
    tipoEcf: "31",
    encf: "E310000000007",
    rncEmisor: PROVEEDOR,
    razonSocialEmisor: "PROVEEDOR EJEMPLO SRL",
    rncComprador: NOSOTROS,
    fechaEmision: "25-09-2026",
    montoTotal: 1180,
    totalItbis: 180,
    xml: "<ECF/>",
    acuseXml: "<ARECF/>",
  });
  const enviadosDgii: string[] = [];
  const entregados: { directorio: DirectorioContribuyente; xml: string; nombre: string }[] = [];
  const contribuyente: ClienteContribuyente = {
    entregarEcf: async () => {
      throw new Error("no usado");
    },
    entregarAprobacion: async (directorio, xml, nombre) => {
      entregados.push({ directorio, xml, nombre });
      return { entregada: true };
    },
  };
  const servicio = crearServicioRecibidos({
    rncPropio: NOSOTROS,
    almacen,
    firmar: (xml) => firmarXml(xml, cargarCertificado(certificadoPrueba(`RNC${NOSOTROS}`).p12, CLAVE_P12_PRUEBA)),
    dgii: {
      enviarAprobacionComercial: async (xml) => {
        enviadosDgii.push(xml);
        return opciones.dgiiAcepta === false
          ? { aceptada: false, mensajes: ["e-CF no encontrado"] }
          : { aceptada: true, mensajes: ["OK"] };
      },
      consultarDirectorio: async () => (opciones.directorio === undefined ? DIRECTORIO : opciones.directorio),
    },
    contribuyente,
    reloj: () => AHORA,
  });
  return { servicio, ecfs, enviadosDgii, entregados };
}

describe("servicio de e-CF recibidos", () => {
  it("lista los recibidos pendientes de aprobación", async () => {
    const { servicio } = await preparar();
    const lista = await servicio.listar();
    expect(lista).toEqual([
      expect.objectContaining({
        id: "r-1",
        encf: "E310000000007",
        rncEmisor: PROVEEDOR,
        montoTotal: 1180,
        estadoAprobacion: "pendiente",
        importadoAt: null,
      }),
    ]);
  });

  it("aprueba: firma el ACECF, lo envía a la DGII y al emisor, y lo registra", async () => {
    const { servicio, ecfs, enviadosDgii, entregados } = await preparar();

    const resultado = await servicio.responder("r-1", { aprobado: true });

    expect(resultado).toEqual({ dgii: { aceptada: true, mensajes: ["OK"] }, emisor: { entregada: true } });
    const [acecf] = enviadosDgii;
    expect(acecf).toContain("<RNCEmisor>101010101</RNCEmisor>");
    expect(acecf).toContain("<RNCComprador>131880738</RNCComprador>");
    expect(acecf).toContain("<Estado>1</Estado>");
    expect(verificarDocumentoFirmado(acecf!, NOSOTROS)).toEqual({ valido: true });
    expect(entregados).toEqual([{ directorio: DIRECTORIO, xml: acecf, nombre: "131880738E310000000007.xml" }]);
    expect(ecfs[0]).toMatchObject({ estadoAprobacion: "aprobado", aprobacionXml: acecf });
  });

  it("un rechazo comercial exige motivo", async () => {
    const { servicio } = await preparar();
    await expect(servicio.responder("r-1", { aprobado: false })).rejects.toBeInstanceOf(DocumentoFiscalInvalidoError);
    const r = await servicio.responder("r-1", { aprobado: false, motivo: "Mercancía dañada" });
    expect(r.dgii.aceptada).toBe(true);
  });

  it("si la DGII no valida la aprobación, no se marca como respondida", async () => {
    const { servicio, ecfs, entregados } = await preparar({ dgiiAcepta: false });
    const r = await servicio.responder("r-1", { aprobado: true });
    expect(r.dgii).toEqual({ aceptada: false, mensajes: ["e-CF no encontrado"] });
    expect(entregados).toEqual([]);
    expect(ecfs[0]?.estadoAprobacion).toBe("pendiente");
  });

  it("si el emisor no está en el directorio, igual queda aprobado ante la DGII", async () => {
    const { servicio, ecfs } = await preparar({ directorio: null });
    const r = await servicio.responder("r-1", { aprobado: true });
    expect(r.emisor).toEqual({ entregada: false, detalle: "El emisor no aparece en el directorio de la DGII." });
    expect(ecfs[0]?.estadoAprobacion).toBe("aprobado");
  });

  it("no se puede responder dos veces ni un id inexistente", async () => {
    const { servicio } = await preparar();
    await servicio.responder("r-1", { aprobado: true });
    await expect(servicio.responder("r-1", { aprobado: true })).rejects.toBeInstanceOf(DocumentoFiscalInvalidoError);
    await expect(servicio.responder("nope", { aprobado: true })).rejects.toThrow(/no existe/);
  });

  it("marca un recibido como importado a Compras", async () => {
    const { servicio, ecfs } = await preparar();
    await servicio.marcarImportado("r-1");
    expect(ecfs[0]?.importadoAt).toBe(AHORA.toISOString());
  });
});
