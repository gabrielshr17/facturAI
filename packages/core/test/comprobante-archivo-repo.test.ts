import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearCompraRepo, crearComprobanteArchivoRepo } from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("comprobanteArchivoRepo — adjuntar comprobante a una compra", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("adjunta un archivo a una compra y lo recupera", async () => {
    const compras = crearCompraRepo(db);
    const archivos = crearComprobanteArchivoRepo(db);
    const compra = await compras.crear({
      lineas: [{ descripcion: "Arroz", cantidad: 1, costoUnitario: 40, impuestoTipo: "itbis18", tasaImpuesto: 0.18 }],
    });

    await archivos.crear({
      compraId: compra.id,
      nombreArchivo: "factura.jpg",
      tipoMime: "image/jpeg",
      contenidoBase64: "ZmFrZS1pbWFnZS1kYXRh",
      mesAno: "2026-07",
      tieneFiscal: true,
    });

    const lista = await archivos.obtenerPorCompra(compra.id);
    expect(lista).toHaveLength(1);
    expect(lista[0].nombre_archivo).toBe("factura.jpg");
    expect(lista[0].tiene_fiscal).toBe(1);
    expect(lista[0].estado_revision).toBe("confirmado_usuario");
    expect(lista[0].identificado_por).toBe("usuario");
  });

  it("borrado lógico: deja de aparecer en obtenerPorCompra", async () => {
    const compras = crearCompraRepo(db);
    const archivos = crearComprobanteArchivoRepo(db);
    const compra = await compras.crear({
      lineas: [{ descripcion: "Arroz", cantidad: 1, costoUnitario: 40, impuestoTipo: "itbis18", tasaImpuesto: 0.18 }],
    });
    const archivo = await archivos.crear({
      compraId: compra.id,
      nombreArchivo: "x.png",
      tipoMime: "image/png",
      contenidoBase64: "abc",
      mesAno: "2026-07",
    });

    await archivos.eliminar(archivo.id);
    expect(await archivos.obtenerPorCompra(compra.id)).toHaveLength(0);
  });
});
