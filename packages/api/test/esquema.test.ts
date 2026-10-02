import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { migrations } from "@sfr/core";

const RUTA_ESQUEMA = fileURLToPath(new URL("../db/schema.sql", import.meta.url));

function columnasSqlite(): Map<string, Set<string>> {
  const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  for (const m of migrations) db.exec(m.sql);
  const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {
    name: string;
  }[];
  const resultado = new Map<string, Set<string>>();
  for (const { name } of tablas) {
    const columnas = db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[];
    resultado.set(name, new Set(columnas.map((c) => c.name)));
  }
  db.close();
  return resultado;
}

async function columnasPostgres(): Promise<Map<string, Set<string>>> {
  const pg = new PGlite();
  await pg.exec(readFileSync(RUTA_ESQUEMA, "utf8"));
  const { rows } = await pg.query<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  await pg.close();
  const resultado = new Map<string, Set<string>>();
  for (const { table_name, column_name } of rows) {
    if (!resultado.has(table_name)) resultado.set(table_name, new Set());
    resultado.get(table_name)!.add(column_name);
  }
  return resultado;
}

describe("db/schema.sql (Postgres) sigue a las migraciones SQLite de @sfr/core", () => {
  it("se ejecuta sin errores en Postgres y tiene todas las tablas y columnas del cliente", async () => {
    const sqlite = columnasSqlite();
    const postgres = await columnasPostgres();

    const faltantes: string[] = [];
    for (const [tabla, columnas] of sqlite) {
      const enPostgres = postgres.get(tabla);
      if (!enPostgres) {
        faltantes.push(`tabla ${tabla}`);
        continue;
      }
      for (const columna of columnas) if (!enPostgres.has(columna)) faltantes.push(`${tabla}.${columna}`);
    }
    expect(faltantes).toEqual([]);
  }, 60_000);

  it("incluye las tablas propias del servidor (llaves de caja y recepción e-CF)", async () => {
    const postgres = await columnasPostgres();
    expect([...(postgres.get("caja_api_key") ?? [])].sort()).toEqual(
      ["created_at", "id", "llave_hash", "nombre", "revocada_at"].sort(),
    );
    expect(postgres.get("ecf_recibido")).toEqual(
      new Set([
        "id",
        "tipo_ecf",
        "encf",
        "rnc_emisor",
        "razon_social_emisor",
        "rnc_comprador",
        "fecha_emision",
        "monto_total",
        "total_itbis",
        "xml",
        "acuse_xml",
        "estado_aprobacion",
        "motivo_aprobacion",
        "aprobacion_xml",
        "aprobacion_enviada_at",
        "importado_at",
        "created_at",
      ]),
    );
    expect(postgres.has("aprobacion_comercial_recibida")).toBe(true);
  }, 60_000);
});

describe("db/schema.sql (Postgres) no expone datos por la API pública de Supabase", () => {
  it("todas las tablas tienen RLS activado y ninguna política abre el acceso", async () => {
    const pg = new PGlite();
    await pg.exec(readFileSync(RUTA_ESQUEMA, "utf8"));
    const sinRls = await pg.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY c.relname`,
    );
    const politicas = await pg.query<{ policyname: string }>("SELECT policyname FROM pg_policies");
    await pg.close();

    expect(sinRls.rows.map((r) => r.relname)).toEqual([]);
    expect(politicas.rows).toEqual([]);
  }, 60_000);
});

describe("db/schema.sql con la tabla notificacion_transferencia ya creada en el proyecto", () => {
  it("se aplica sin errores y conserva las filas existentes", async () => {
    const pg = new PGlite();
    await pg.exec(
      `CREATE TABLE notificacion_transferencia (
         id TEXT PRIMARY KEY, monto NUMERIC(12,2), fecha DATE, banco_origen TEXT, remitente TEXT, referencia TEXT,
         correo_snippet TEXT NOT NULL, estado_confirmacion TEXT NOT NULL DEFAULT 'pendiente',
         identificado_por TEXT NOT NULL DEFAULT 'chatbot', datos_extraidos_json JSONB,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ);
       CREATE INDEX ix_notificacion_transferencia_estado ON notificacion_transferencia(estado_confirmacion);
       INSERT INTO notificacion_transferencia (id, correo_snippet) VALUES ('t1', 'previa');`,
    );

    await pg.exec(readFileSync(RUTA_ESQUEMA, "utf8"));

    const { rows } = await pg.query<{ id: string }>("SELECT id FROM notificacion_transferencia");
    await pg.close();
    expect(rows).toEqual([{ id: "t1" }]);
  }, 60_000);
});
