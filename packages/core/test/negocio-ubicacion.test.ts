import { describe, it, expect } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import { crearNegocioRepo } from "../src/index.js";

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
