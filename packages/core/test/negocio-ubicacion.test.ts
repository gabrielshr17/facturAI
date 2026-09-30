import { describe, it, expect } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import { crearComprobanteFiscalRepo, crearFacturaRepo, crearNegocioRepo, crearSecuenciaNcfRepo } from "../src/index.js";

async function nuevoRepo() {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return crearNegocioRepo(db);
}

describe("municipio y provincia del negocio", () => {
  it("se guardan al crear el negocio y se devuelven", async () => {
    const repo = await nuevoRepo();

    await repo.guardar({ nombre_comercial: "Marohi", municipio: "Santo Domingo Este", provincia: "Santo Domingo" });

    expect(await repo.obtener()).toMatchObject({ municipio: "Santo Domingo Este", provincia: "Santo Domingo" });
  });

  it("se conservan si se actualiza el negocio sin mencionarlos", async () => {
    const repo = await nuevoRepo();
    await repo.guardar({ nombre_comercial: "Marohi", municipio: "Santo Domingo Este", provincia: "Santo Domingo" });

    await repo.guardar({ nombre_comercial: "Marohi SRL" });

    expect(await repo.obtener()).toMatchObject({
      nombre_comercial: "Marohi SRL",
      municipio: "Santo Domingo Este",
      provincia: "Santo Domingo",
    });
  });

  it("se pueden cambiar", async () => {
    const repo = await nuevoRepo();
    await repo.guardar({ nombre_comercial: "Marohi", municipio: "Santo Domingo Este", provincia: "Santo Domingo" });

    await repo.guardar({ nombre_comercial: "Marohi", municipio: "Santiago", provincia: "Santiago" });

    expect(await repo.obtener()).toMatchObject({ municipio: "Santiago", provincia: "Santiago" });
  });
});

describe("notas de una venta", () => {
  it("lista las notas de crédito y débito de una factura, en orden, sin el comprobante original", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    const repo = crearComprobanteFiscalRepo(db);
    const secuencia = await crearSecuenciaNcfRepo(db).crear({
      tipoEcf: "32",
      rangoDesde: 1,
      rangoHasta: 10,
      vencimiento: "2099-12-31",
    });
    const facturaId = (await crearFacturaRepo(db).abrirTicket()).id;
    const base = {
      facturaId,
      secuenciaId: secuencia.id,
      rncEmisor: null,
      receptorDocumentoTipo: null,
      receptorDocumentoNumero: null,
      montoGravado: 0,
      montoExento: 0,
      montoItbis: 0,
      total: 0,
      estadoDgii: "aceptado" as const,
    };
    await repo.crear({ ...base, tipoEcf: "32", ncf: "E320000000001" });
    await repo.crear({ ...base, tipoEcf: "34", ncf: "E340000000001" });
    await repo.crear({ ...base, tipoEcf: "33", ncf: "E330000000001" });

    const notas = await repo.listarNotasPorFactura(facturaId);

    expect(notas.map((n) => n.ncf)).toEqual(["E340000000001", "E330000000001"]);
  });
});
