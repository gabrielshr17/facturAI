import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearNcfAnulacionRepo,
  type EstadoDgii,
} from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("revisión fiscal (panel de Facturación electrónica)", () => {
  let db: SqlDriver;

  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function comprobante(ncf: string, estadoDgii: EstadoDgii) {
    const t = await crearFacturaRepo(db).abrirTicket();
    const secuencia = await crearSecuenciaNcfRepo(db).crear({
      tipoEcf: "31",
      rangoDesde: 1,
      rangoHasta: 100,
      vencimiento: "2099-12-31",
    });
    return crearComprobanteFiscalRepo(db).crear({
      facturaId: t.id,
      tipoEcf: "31",
      ncf,
      secuenciaId: secuencia.id,
      rncEmisor: "131880738",
      receptorDocumentoTipo: "rnc",
      receptorDocumentoNumero: "101010101",
      montoGravado: 100,
      montoExento: 0,
      montoItbis: 18,
      total: 118,
      estadoDgii,
    });
  }

  it("lista lo que requiere atención: en validación, rechazados y entregas fallidas", async () => {
    const repo = crearComprobanteFiscalRepo(db);
    await comprobante("E310000000001", "pendiente");
    await comprobante("E310000000002", "rechazado");
    await comprobante("E310000000003", "aceptado");
    const entregaFallida = await comprobante("E310000000004", "aceptado");
    await repo.registrarEntrega(entregaFallida.id, "rechazado", "El comprador no lo recibió (motivo 4).", null);

    const ncfs = (await repo.listarParaRevision()).map((c) => c.ncf).sort();
    expect(ncfs).toEqual(["E310000000001", "E310000000002", "E310000000004"]);
  });

  it("un e-NCF utilizado se puede marcar como revisado y sale de la lista", async () => {
    const repo = crearNcfAnulacionRepo(db);
    await repo.registrar({ tipoEcf: "31", ncf: "E310000000009", motivo: "tiempo de espera agotado" });
    const [pendiente] = await repo.listarPendientes();
    await repo.marcarUtilizados([pendiente!.id], "La DGII sí recibió este e-NCF: trackId t-1 (aceptado).");

    const [utilizado] = await repo.listarUtilizados();
    await repo.marcarRevisado(utilizado!.id);

    expect(await repo.listarUtilizados()).toEqual([]);
    expect(await repo.listarPendientes()).toEqual([]);
  });
});
