import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  entregarComprobantesAReceptores,
  type EstadoDgii,
  type TipoEcf,
} from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("entrega de e-CF a compradores electrónicos", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function comprobante(opciones: {
    tipoEcf: TipoEcf;
    ncf: string;
    estadoDgii: EstadoDgii;
    receptorTipo?: "rnc" | "cedula" | null;
  }) {
    const t = await crearFacturaRepo(db).abrirTicket();
    const secuencia = await crearSecuenciaNcfRepo(db).crear({
      tipoEcf: opciones.tipoEcf,
      rangoDesde: 1,
      rangoHasta: 100,
      vencimiento: "2099-12-31",
    });
    const receptorTipo = opciones.receptorTipo === undefined ? "rnc" : opciones.receptorTipo;
    return crearComprobanteFiscalRepo(db).crear({
      facturaId: t.id,
      tipoEcf: opciones.tipoEcf,
      ncf: opciones.ncf,
      secuenciaId: secuencia.id,
      rncEmisor: "131880738",
      receptorDocumentoTipo: receptorTipo,
      receptorDocumentoNumero: receptorTipo ? "101010101" : null,
      montoGravado: 100,
      montoExento: 0,
      montoItbis: 18,
      total: 118,
      estadoDgii: opciones.estadoDgii,
      xmlFirmado: `<ECF>${opciones.ncf}</ECF>`,
    });
  }

  it("solo los E31/E33/E34/E45 a un RNC quedan pendientes de entrega; el resto no aplica", async () => {
    const repo = crearComprobanteFiscalRepo(db);
    const e31 = await comprobante({ tipoEcf: "31", ncf: "E310000000001", estadoDgii: "aceptado" });
    const e32 = await comprobante({ tipoEcf: "32", ncf: "E320000000001", estadoDgii: "aceptado" });
    const e34Cedula = await comprobante({
      tipoEcf: "34",
      ncf: "E340000000001",
      estadoDgii: "aceptado",
      receptorTipo: "cedula",
    });

    expect((await repo.obtener(e31.id))?.entrega_estado).toBe("pendiente");
    expect((await repo.obtener(e32.id))?.entrega_estado).toBe("no_aplica");
    expect((await repo.obtener(e34Cedula.id))?.entrega_estado).toBe("no_aplica");
  });

  it("entrega solo los ya aceptados por la DGII y registra el resultado", async () => {
    const repo = crearComprobanteFiscalRepo(db);
    const aceptado = await comprobante({ tipoEcf: "31", ncf: "E310000000001", estadoDgii: "aceptado" });
    const condicional = await comprobante({ tipoEcf: "34", ncf: "E340000000001", estadoDgii: "aceptado_condicional" });
    const enProceso = await comprobante({ tipoEcf: "31", ncf: "E310000000002", estadoDgii: "pendiente" });

    const llamadas: string[] = [];
    const resumen = await entregarComprobantesAReceptores({
      comprobanteRepo: repo,
      entregar: async (datos) => {
        llamadas.push(`${datos.encf}->${datos.rncComprador}`);
        return datos.encf === "E340000000001"
          ? { electronico: false }
          : { electronico: true, recibido: true, acuseXml: "<ARECF/>" };
      },
    });

    expect(llamadas).toEqual(["E310000000001->101010101", "E340000000001->101010101"]);
    expect(resumen).toEqual({ entregados: 1, noElectronicos: 1, rechazados: [], errores: 0 });
    expect(await repo.obtener(aceptado.id)).toMatchObject({
      entrega_estado: "entregado",
      acuse_recibo_xml: "<ARECF/>",
    });
    expect((await repo.obtener(condicional.id))?.entrega_estado).toBe("no_electronico");
    expect((await repo.obtener(enProceso.id))?.entrega_estado).toBe("pendiente");
  });

  it("un acuse de no recibido queda registrado con su motivo; una falla de red se reintenta", async () => {
    const repo = crearComprobanteFiscalRepo(db);
    const rechazado = await comprobante({ tipoEcf: "31", ncf: "E310000000001", estadoDgii: "aceptado" });
    const caido = await comprobante({ tipoEcf: "31", ncf: "E310000000002", estadoDgii: "aceptado" });

    const resumen = await entregarComprobantesAReceptores({
      comprobanteRepo: repo,
      entregar: async (datos) => {
        if (datos.encf === "E310000000002") throw new Error("sin red");
        return { electronico: true, recibido: false, motivo: 4, acuseXml: "<ARECF>no</ARECF>" };
      },
    });

    expect(resumen).toEqual({ entregados: 0, noElectronicos: 0, rechazados: ["E310000000001"], errores: 1 });
    expect(await repo.obtener(rechazado.id)).toMatchObject({
      entrega_estado: "rechazado",
      entrega_detalle: "El comprador no lo recibió (motivo 4).",
    });
    expect((await repo.obtener(caido.id))?.entrega_estado).toBe("pendiente");
  });

  it("si el comprador responde 'envío duplicado' (motivo 3) ya lo tiene: cuenta como entregado", async () => {
    const repo = crearComprobanteFiscalRepo(db);
    const c = await comprobante({ tipoEcf: "31", ncf: "E310000000001", estadoDgii: "aceptado" });

    const resumen = await entregarComprobantesAReceptores({
      comprobanteRepo: repo,
      entregar: async () => ({ electronico: true, recibido: false, motivo: 3, acuseXml: "<ARECF>dup</ARECF>" }),
    });

    expect(resumen).toEqual({ entregados: 1, noElectronicos: 0, rechazados: [], errores: 0 });
    expect(await repo.obtener(c.id)).toMatchObject({
      entrega_estado: "entregado",
      entrega_detalle: "El comprador ya lo tenía (envío duplicado).",
    });
  });
});
