import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearProductoRepo, ValidacionError } from "../src/repos/producto-repo.js";
import { crearClienteRepo } from "../src/repos/cliente-repo.js";
import { crearNegocioRepo } from "../src/repos/negocio-repo.js";
import { crearDepartamentoRepo } from "../src/repos/departamento-repo.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("productoRepo — CRUD persiste en SQLite", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crea y persiste, derivando el precio del costo", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Arroz 5lb", costo: 40, pct_ganancia: 25 });
    // 40 + 25% = 50, con el ITBIS ya incluido en ese precio
    expect(p.precio_venta).toBe(50);

    const leido = await repo.obtener(p.id);
    expect(leido?.descripcion).toBe("Arroz 5lb");
  });

  it("un producto nuevo sin % indicado nace con 20% de ganancia", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Aceite", costo: 100 });
    expect(p.pct_ganancia).toBe(20);
    expect(p.precio_venta).toBe(120);
  });

  it("avisa en español cuál producto tiene ya ese código de barra", async () => {
    const repo = crearProductoRepo(db);
    await repo.crear({ descripcion: "Coca Cola 2L", codigo_barra: "7501055300006" });
    await expect(
      repo.crear({ descripcion: "Coca Cola grande", codigo_barra: "7501055300006" }),
    ).rejects.toThrow(/ya está asignado a "Coca Cola 2L"/);
  });

  it("editar un producto no choca con su propio código de barra", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Pan", codigo_barra: "123" });
    await repo.actualizar(p.id, { descripcion: "Pan de agua", codigo_barra: "123" });
    expect((await repo.obtener(p.id))?.descripcion).toBe("Pan de agua");
  });

  it("encuentra un producto repetido por descripción, sin importar acentos ni mayúsculas", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Jabón Rosa" });
    expect((await repo.porDescripcion("  jabon rosa "))?.id).toBe(p.id);
    expect(await repo.porDescripcion("Jabón Rosa", p.id)).toBeUndefined();
    expect(await repo.porDescripcion("Otro")).toBeUndefined();
  });

  it("respeta el precio manual (manda sobre la derivación)", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Refresco", costo: 20, pct_ganancia: 50, precio_venta: 35 });
    expect(p.precio_venta).toBe(35);
  });

  it("actualiza y recalcula precio", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Jabón", costo: 10, pct_ganancia: 0 });
    await repo.actualizar(p.id, { descripcion: "Jabón azul", costo: 10, pct_ganancia: 100 });
    const leido = await repo.obtener(p.id);
    expect(leido?.descripcion).toBe("Jabón azul");
    expect(leido?.precio_venta).toBe(20); // 10 + 100% = 20
  });

  it("elimina (borrado lógico) y deja de listarse", async () => {
    const repo = crearProductoRepo(db);
    const p = await repo.crear({ descripcion: "Temporal" });
    await repo.eliminar(p.id);
    expect(await repo.obtener(p.id)).toBeUndefined();
    expect(await repo.listar()).toHaveLength(0);
  });

  it("busca por descripción y por código de barra", async () => {
    const repo = crearProductoRepo(db);
    await repo.crear({ descripcion: "Aceite Crisol", codigo_barra: "7460100200300" });
    await repo.crear({ descripcion: "Harina Blanca" });

    expect(await repo.listar("aceite")).toHaveLength(1);
    expect(await repo.listar("HARINA")).toHaveLength(1); // insensible a mayúsculas
    expect(await repo.porCodigoBarra("7460100200300")).toBeDefined();
    expect(await repo.listar()).toHaveLength(2);
  });

  it("rechaza producto sin descripción", async () => {
    const repo = crearProductoRepo(db);
    await expect(repo.crear({ descripcion: "  " })).rejects.toBeInstanceOf(ValidacionError);
  });
});

describe("clienteRepo — CRUD y validaciones", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crea, busca y elimina", async () => {
    const repo = crearClienteRepo(db);
    await repo.crear({ nombre: "María", apellidos: "Gómez", telefono: "809-111-2222" });
    await repo.crear({ nombre: "Pedro", correo: "pedro@mail.com" });

    expect(await repo.listar()).toHaveLength(2);
    expect(await repo.listar("maria")).toHaveLength(1);
    expect(await repo.listar("809-111")).toHaveLength(1);

    const [m] = await repo.listar("maria");
    await repo.eliminar(m.id);
    expect(await repo.listar()).toHaveLength(1);
  });

  it("rechaza correo inválido", async () => {
    const repo = crearClienteRepo(db);
    await expect(repo.crear({ nombre: "X", correo: "malo@" })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("rechaza RNC inválido", async () => {
    const repo = crearClienteRepo(db);
    await expect(
      repo.crear({ nombre: "Empresa", documento_tipo: "rnc", documento_numero: "111111111" }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });
});

describe("negocioRepo — configuración (singleton)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("guarda y luego actualiza la misma fila", async () => {
    const repo = crearNegocioRepo(db);
    expect(await repo.obtener()).toBeUndefined();

    await repo.guardar({ nombre_comercial: "Mi Colmado", ancho_impresora_default: 58 });
    let cfg = await repo.obtener();
    expect(cfg?.nombre_comercial).toBe("Mi Colmado");
    expect(cfg?.ancho_impresora_default).toBe(58);

    await repo.guardar({ nombre_comercial: "Mi Colmado", ancho_impresora_default: 80 });
    const todos = await db.all("SELECT id FROM negocio WHERE deleted_at IS NULL");
    expect(todos).toHaveLength(1); // sigue siendo una sola fila
    cfg = await repo.obtener();
    expect(cfg?.ancho_impresora_default).toBe(80);
  });

  it("rechaza ancho de impresora inválido", async () => {
    const repo = crearNegocioRepo(db);
    await expect(
      repo.guardar({ nombre_comercial: "X", ancho_impresora_default: 72 as 58 }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });
});

describe("departamentoRepo", () => {
  it("crea, lista, renombra y elimina", async () => {
    const db = await nuevaDb();
    const repo = crearDepartamentoRepo(db);
    const d = await repo.crear("Bebidas");
    expect(await repo.listar()).toHaveLength(1);
    await repo.renombrar(d.id, "Bebidas frías");
    expect((await repo.listar())[0].nombre).toBe("Bebidas frías");
    await repo.eliminar(d.id);
    expect(await repo.listar()).toHaveLength(0);
  });
});
