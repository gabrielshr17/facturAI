import { describe, it, expect } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import { migrations } from "../src/db/migrations.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearBackupRepo, crearComprobanteFiscalRepo, crearFacturaRepo, crearSecuenciaNcfRepo } from "../src/index.js";

const ULTIMA_ANTES_DE_COMPRAS = 13;

async function dbHastaLaVersion(version: number): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await db.exec("CREATE TABLE _migracion (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, aplicada_at TEXT NOT NULL);");
  for (const m of migrations.filter((x) => x.id <= version)) {
    await db.exec(m.sql);
    await db.run("INSERT INTO _migracion (id, nombre, aplicada_at) VALUES (?, ?, ?)", [m.id, m.nombre, "2026-01-01"]);
  }
  return db;
}

/** Una base de datos con la forma antigua: el comprobante se inserta con SQL de la versión 13, sin compra_id. */
async function ventaFiscalPrevia(db: SqlDriver) {
  const facturaRepo = crearFacturaRepo(db);
  const secuencia = await crearSecuenciaNcfRepo(db).crear({
    tipoEcf: "32",
    rangoDesde: 1,
    rangoHasta: 100,
    vencimiento: "2099-12-31",
  });
  const ticket = await facturaRepo.abrirTicket();
  await facturaRepo.agregarLinea(ticket.id, {
    descripcion: "Arroz",
    cantidad: 1,
    precioUnitario: 118,
    impuestoTipo: "itbis18",
    tasaImpuesto: 0.18,
  });
  await facturaRepo.cobrar(ticket.id, { pagos: [{ metodo: "efectivo", monto: 118 }] });
  await db.run(
    `INSERT INTO comprobante_fiscal (id, factura_id, tipo_ecf, ncf, secuencia_id, fecha_emision, estado_dgii,
       codigo_seguridad, xml_firmado, created_at, updated_at)
     VALUES ('cf-previo', ?, '32', 'E320000000001', ?, 't', 'aceptado', 'AbC123', '<ECF>firmado</ECF>', 't', 't')`,
    [ticket.id, secuencia.id],
  );
  await db.run("UPDATE factura SET comprobante_id='cf-previo' WHERE id=?", [ticket.id]);
  return { facturaId: ticket.id, comprobanteId: "cf-previo", ncf: "E320000000001", secuenciaId: secuencia.id };
}

async function insertarComprobanteDeCompra(db: SqlDriver, secuenciaId: string, ncf: string): Promise<void> {
  await db.run(
    "INSERT INTO compra (id, fecha, mes_ano_contable, created_at, updated_at) VALUES ('c1', '2026-10-01', '2026-10', 't', 't')",
  );
  await db.run(
    `INSERT INTO comprobante_fiscal (id, compra_id, tipo_ecf, ncf, secuencia_id, fecha_emision, created_at, updated_at)
     VALUES ('cf-compra', 'c1', '41', ?, ?, 't', 't', 't')`,
    [ncf, secuenciaId],
  );
}

describe("comprobante_fiscal de una compra (E41, E43, E47)", () => {
  it("acepta un comprobante ligado a una compra y sin factura", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    const secuencia = await crearSecuenciaNcfRepo(db).crear({
      tipoEcf: "41",
      rangoDesde: 1,
      rangoHasta: 10,
      vencimiento: "2099-12-31",
    });

    await insertarComprobanteDeCompra(db, secuencia.id, "E410000000001");

    const fila = await db.get<{ factura_id: string | null; compra_id: string }>(
      "SELECT factura_id, compra_id FROM comprobante_fiscal WHERE id='cf-compra'",
    );
    expect(fila).toEqual({ factura_id: null, compra_id: "c1" });
  });

  it("rechaza un comprobante sin factura ni compra", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    const secuencia = await crearSecuenciaNcfRepo(db).crear({
      tipoEcf: "41",
      rangoDesde: 1,
      rangoHasta: 10,
      vencimiento: "2099-12-31",
    });

    await expect(
      db.run(
        `INSERT INTO comprobante_fiscal (id, tipo_ecf, ncf, secuencia_id, fecha_emision, created_at, updated_at)
         VALUES ('huerfano', '41', 'E410000000002', ?, 't', 't', 't')`,
        [secuencia.id],
      ),
    ).rejects.toThrow();
  });

  it("migrar conserva los comprobantes existentes, sus enlaces, sus índices y las llaves foráneas", async () => {
    const db = await dbHastaLaVersion(ULTIMA_ANTES_DE_COMPRAS);
    const venta = await ventaFiscalPrevia(db);

    await migrate(db);

    const conservado = await crearComprobanteFiscalRepo(db).obtener(venta.comprobanteId);
    expect(conservado).toMatchObject({
      ncf: venta.ncf,
      factura_id: venta.facturaId,
      estado_dgii: "aceptado",
      xml_firmado: "<ECF>firmado</ECF>",
      codigo_seguridad: "AbC123",
    });
    const factura = await crearFacturaRepo(db).obtener(venta.facturaId);
    expect(factura?.comprobante_id).toBe(venta.comprobanteId);
    expect(await db.all("PRAGMA foreign_key_check")).toEqual([]);
    expect(((await db.get<{ foreign_keys: number }>("PRAGMA foreign_keys")) ?? { foreign_keys: 0 }).foreign_keys).toBe(
      1,
    );

    await expect(
      db.run(
        `INSERT INTO comprobante_fiscal (id, factura_id, tipo_ecf, ncf, secuencia_id, fecha_emision, created_at, updated_at)
         VALUES ('dup', ?, '32', ?, ?, 't', 't', 't')`,
        [venta.facturaId, venta.ncf, venta.secuenciaId],
      ),
    ).rejects.toThrow();
    const indices = await db.all<{ name: string }>("PRAGMA index_list(comprobante_fiscal)");
    expect(indices.map((i) => i.name)).toEqual(
      expect.arrayContaining([
        "ux_comprobante_fiscal_ncf",
        "ix_comprobante_fiscal_factura",
        "ix_comprobante_fiscal_estado",
        "ix_comprobante_fiscal_entrega",
        "ix_comprobante_fiscal_compra",
        "ux_comprobante_fiscal_compra",
      ]),
    );
  });
});

describe("respaldo con comprobantes de compra", () => {
  it("restaura la compra antes que su comprobante", async () => {
    const origen = createNodeSqliteDriver();
    await migrate(origen);
    const secuencia = await crearSecuenciaNcfRepo(origen).crear({
      tipoEcf: "41",
      rangoDesde: 1,
      rangoHasta: 10,
      vencimiento: "2099-12-31",
    });
    await insertarComprobanteDeCompra(origen, secuencia.id, "E410000000001");
    const respaldo = await crearBackupRepo(origen).exportarTodo();

    const destino = createNodeSqliteDriver();
    await migrate(destino);
    await crearBackupRepo(destino).importarTodo(respaldo);

    const fila = await destino.get<{ compra_id: string }>(
      "SELECT compra_id FROM comprobante_fiscal WHERE id='cf-compra'",
    );
    expect(fila?.compra_id).toBe("c1");
  });
});

describe("migración de comprobante_fiscal interrumpida y reanudada", () => {
  async function aplicarSinRegistrar(db: SqlDriver, id: number): Promise<void> {
    const migracion = migrations.find((m) => m.id === id);
    await db.exec(migracion!.sql);
  }

  it("repetir los pasos 14 y 15 tras una interrupción no pierde comprobantes ni enlaces", async () => {
    const db = await dbHastaLaVersion(ULTIMA_ANTES_DE_COMPRAS);
    const venta = await ventaFiscalPrevia(db);

    await aplicarSinRegistrar(db, 14);
    await aplicarSinRegistrar(db, 14);
    await aplicarSinRegistrar(db, 15);
    await aplicarSinRegistrar(db, 15);
    await aplicarSinRegistrar(db, 16);

    const conservado = await crearComprobanteFiscalRepo(db).obtener(venta.comprobanteId);
    expect(conservado?.ncf).toBe(venta.ncf);
    expect((await crearFacturaRepo(db).obtener(venta.facturaId))?.comprobante_id).toBe(venta.comprobanteId);
    expect(await db.all("PRAGMA foreign_key_check")).toEqual([]);
    const sobrantes = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_respaldo'",
    );
    expect(sobrantes).toEqual([]);
  });

  it("no permite dos comprobantes activos para la misma compra", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    const secuencia = await crearSecuenciaNcfRepo(db).crear({
      tipoEcf: "41",
      rangoDesde: 1,
      rangoHasta: 10,
      vencimiento: "2099-12-31",
    });
    await insertarComprobanteDeCompra(db, secuencia.id, "E410000000001");

    await expect(
      db.run(
        `INSERT INTO comprobante_fiscal (id, compra_id, tipo_ecf, ncf, secuencia_id, fecha_emision, created_at, updated_at)
         VALUES ('otro', 'c1', '41', 'E410000000002', ?, 't', 't', 't')`,
        [secuencia.id],
      ),
    ).rejects.toThrow();
  });
});

describe("migración de comprobante_fiscal con el driver de escritorio", () => {
  it("funciona ejecutando cada sentencia por separado, como lo hace tauri-plugin-sql", async () => {
    const db = await dbHastaLaVersion(ULTIMA_ANTES_DE_COMPRAS);
    const venta = await ventaFiscalPrevia(db);

    for (const id of [14, 15, 16]) {
      const sentencias = migrations
        .find((m) => m.id === id)!
        .sql.split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const sentencia of sentencias) await db.run(sentencia);
    }

    expect((await crearComprobanteFiscalRepo(db).obtener(venta.comprobanteId))?.ncf).toBe(venta.ncf);
    expect((await crearFacturaRepo(db).obtener(venta.facturaId))?.comprobante_id).toBe(venta.comprobanteId);
    expect(await db.all("PRAGMA foreign_key_check")).toEqual([]);
  });
});
