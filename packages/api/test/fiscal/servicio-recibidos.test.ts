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

const certProveedor = () => cargarCertificado(certificadoPrueba(`RNC${PROVEEDOR}`).p12, CLAVE_P12_PRUEBA);

async function preparar(
  opciones: {
    directorio?: DirectorioContribuyente | null;
    dgiiAcepta?: boolean;
    dgiiNoReconocida?: boolean;
    estadoEnDgii?: { estado: "aceptado" | "rechazado" | "no_encontrado"; montoTotal: number | null };
    fallaAlGuardar?: boolean;
  } = {},
) {
  const { almacen, ecfs } = crearAlmacenMemoria();
  if (opciones.fallaAlGuardar) {
    almacen.registrarAprobacionEmitida = async () => {
      throw new Error("Postgres no disponible");
    };
  }
  await almacen.guardarEcf({
    tipoEcf: "31",
    encf: "E310000000007",
    rncEmisor: PROVEEDOR,
    razonSocialEmisor: "PROVEEDOR EJEMPLO SRL",
    rncComprador: NOSOTROS,
    fechaEmision: "25-09-2026",
    montoTotal: 1180,
    totalItbis: 180,
    xml: firmarXml(
      "<ECF><Encabezado><IdDoc><IndicadorMontoGravado>1</IndicadorMontoGravado></IdDoc></Encabezado><DetallesItems>" +
        "<Item><IndicadorFacturacion>1</IndicadorFacturacion><NombreItem>Cemento</NombreItem>" +
        "<CantidadItem>10</CantidadItem><MontoItem>1180.00</MontoItem></Item></DetallesItems></ECF>",
      certProveedor(),
    ),
    acuseXml: "<ARECF/>",
  });
  const enviadosDgii: string[] = [];
  const consultasEstado: string[] = [];
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
        if (opciones.dgiiNoReconocida) {
          return { aceptada: false, estado: "no_reconocida", mensajes: ["raro"], respuestaCruda: "raro" };
        }
        return opciones.dgiiAcepta === false
          ? { aceptada: false, estado: "rechazada", mensajes: ["e-CF no encontrado"], respuestaCruda: "{}" }
          : { aceptada: true, estado: "aceptada", mensajes: ["OK"], respuestaCruda: "{}" };
      },
      consultarDirectorio: async () => (opciones.directorio === undefined ? DIRECTORIO : opciones.directorio),
      consultarEstadoEcf: async (rncEmisor, encf, rncComprador, codigo) => {
        consultasEstado.push(`${rncEmisor}/${encf}/${rncComprador}/${codigo}`);
        return opciones.estadoEnDgii ?? { estado: "aceptado", montoTotal: 1180 };
      },
    },
    contribuyente,
    reloj: () => AHORA,
  });
  return { servicio, ecfs, enviadosDgii, entregados, consultasEstado };
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

    expect(resultado).toMatchObject({ dgii: { aceptada: true, mensajes: ["OK"] }, emisor: { entregada: true } });
    const [acecf] = enviadosDgii;
    expect(acecf).toContain("<RNCEmisor>101010101</RNCEmisor>");
    expect(acecf).toContain("<RNCComprador>131880738</RNCComprador>");
    expect(acecf).toContain("<Estado>1</Estado>");
    expect(verificarDocumentoFirmado(acecf!, NOSOTROS)).toEqual({ valido: true });
    expect(entregados).toEqual([{ directorio: DIRECTORIO, xml: acecf, nombre: "131880738E310000000007.xml" }]);
    expect(ecfs[0]).toMatchObject({ estadoAprobacion: "aprobado", aprobacionXml: acecf });
  });

  it("antes de aprobar confirma con la DGII que el e-CF existe con ese código de seguridad", async () => {
    const { servicio, consultasEstado, ecfs } = await preparar();
    await servicio.responder("r-1", { aprobado: true });
    const codigo = /<SignatureValue>([^<]{6})/.exec(ecfs[0]!.xml)?.[1];
    expect(consultasEstado).toEqual([`${PROVEEDOR}/E310000000007/${NOSOTROS}/${codigo}`]);
  });

  it("un e-CF que la DGII no reconoce no se aprueba ni se registra como compra", async () => {
    const { servicio, enviadosDgii } = await preparar({ estadoEnDgii: { estado: "no_encontrado", montoTotal: null } });
    await expect(servicio.responder("r-1", { aprobado: true })).rejects.toThrow(/DGII no reconoce/);
    await expect(servicio.detalle("r-1")).rejects.toThrow(/DGII no reconoce/);
    expect(enviadosDgii).toEqual([]);
  });

  it("un e-CF cuyo monto no coincide con el de la DGII se trata como no confiable", async () => {
    const { servicio } = await preparar({ estadoEnDgii: { estado: "aceptado", montoTotal: 10 } });
    await expect(servicio.detalle("r-1")).rejects.toBeInstanceOf(DocumentoFiscalInvalidoError);
  });

  it("dos respuestas simultáneas envían una sola a la DGII", async () => {
    const { servicio, enviadosDgii } = await preparar();
    const resultados = await Promise.allSettled([
      servicio.responder("r-1", { aprobado: true }),
      servicio.responder("r-1", { aprobado: true }),
    ]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.find((r) => r.status === "rejected")).toMatchObject({
      reason: expect.any(DocumentoFiscalInvalidoError),
    });
    expect(enviadosDgii).toHaveLength(1);
  });

  it("si la DGII aceptó pero no se pudo guardar, queda 'enviando' y no se puede reenviar", async () => {
    const { servicio, ecfs, enviadosDgii } = await preparar({ fallaAlGuardar: true });
    await expect(servicio.responder("r-1", { aprobado: true })).rejects.toThrow(/no la vuelvas a enviar/);
    expect(ecfs[0]?.estadoAprobacion).toBe("enviando");
    await expect(servicio.responder("r-1", { aprobado: true })).rejects.toBeInstanceOf(DocumentoFiscalInvalidoError);
    expect(enviadosDgii).toHaveLength(1);
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
    expect(r.dgii).toMatchObject({ aceptada: false, mensajes: ["e-CF no encontrado"] });
    expect(entregados).toEqual([]);
    expect(ecfs[0]?.estadoAprobacion).toBe("pendiente");
  });

  it("si la respuesta de la DGII no se entiende, no se libera el e-CF para no duplicar la aprobación", async () => {
    const { servicio, ecfs } = await preparar({ dgiiNoReconocida: true });
    await expect(servicio.responder("r-1", { aprobado: true })).rejects.toThrow(/no se pudo interpretar/);
    expect(ecfs[0]?.estadoAprobacion).toBe("enviando");
    await expect(servicio.responder("r-1", { aprobado: true })).rejects.toThrow(/ya fue/);
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

  it("el detalle trae las líneas listas para registrar la compra", async () => {
    const { servicio } = await preparar();
    const detalle = await servicio.detalle("r-1");
    expect(detalle.recibido.encf).toBe("E310000000007");
    expect(detalle.items).toEqual([
      { descripcion: "Cemento", cantidad: 10, costoUnitario: 118, impuestoTipo: "itbis18", tasaImpuesto: 0.18 },
    ]);
    await expect(servicio.detalle("nope")).rejects.toThrow(/no existe/);
  });

  it("marca un recibido como importado a Compras", async () => {
    const { servicio, ecfs } = await preparar();
    await servicio.marcarImportado("r-1");
    expect(ecfs[0]?.importadoAt).toBe(AHORA.toISOString());
  });
});
