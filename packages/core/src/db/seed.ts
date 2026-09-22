import type { SqlDriver } from "./driver.js";
import { now } from "../ids.js";

/**
 * Datos de ejemplo del MVP. Idempotente: si ya hay un negocio, no hace nada.
 * Incluye (verificación del plan): un producto completo y una factura normal
 * con su línea y su pago. IDs fijos para poder referenciarlos en tests.
 */
export async function seed(db: SqlDriver): Promise<void> {
  const existe = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM negocio");
  if (existe && existe.n > 0) return;

  const ts = now();

  await db.run(
    `INSERT INTO negocio (id, nombre_comercial, razon_social, rnc, direccion, telefono,
       correo, regimen, ancho_impresora_default, redondeo_centavo, inventario_activo,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      "negocio-demo",
      "Colmado La Esperanza",
      "La Esperanza SRL",
      "130123456",
      "Calle Duarte #45, Santiago",
      "809-555-0100",
      "ventas@laesperanza.do",
      "Régimen Ordinario",
      80,
      1,
      0, // inventario off en el MVP
      ts,
      ts,
    ],
  );

  await db.run(
    `INSERT INTO usuario (id, nombre, rol, activo, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    ["usuario-admin", "Administrador", "admin", 1, ts, ts],
  );

  await db.run(
    `INSERT INTO caja (id, nombre, ubicacion, activa, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    ["caja-1", "Caja Principal", "Mostrador", 1, ts, ts],
  );

  await db.run(
    `INSERT INTO departamento (id, nombre, activo, created_at, updated_at)
     VALUES (?,?,?,?,?)`,
    ["dep-abarrotes", "Abarrotes", 1, ts, ts],
  );

  // Producto completo (todos los campos del modelo).
  await db.run(
    `INSERT INTO producto (id, codigo_barra, descripcion, tipo_venta, unidad_medida,
       costo, pct_ganancia, precio_venta, precio_mayoreo, departamento_id,
       impuesto_tipo, tasa_impuesto, existencia, politica_sin_existencia, activo,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      "prod-arroz",
      "7460170310017",
      "Arroz Selecto 5 lb",
      "unidad",
      "unidad",
      40.0, // costo
      25.0, // % ganancia
      50.0, // precio venta (costo + 25%)
      47.0, // precio mayoreo
      "dep-abarrotes",
      "itbis18",
      0.18,
      null, // existencia: inventario off en el MVP
      "advertir",
      1,
      ts,
      ts,
    ],
  );

  await db.run(
    `INSERT INTO cliente (id, nombre, apellidos, telefono, correo, aplica_credito,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    ["cli-demo", "Juan", "Pérez", "809-555-0199", "juan@example.com", 0, ts, ts],
  );

  // Factura normal: 2 x arroz a 50.00 (ITBIS incluido) = 100.00
  // Desglose: gravado 84.75 + ITBIS 15.25 = 100.00
  await db.run(
    `INSERT INTO factura (id, numero_interno, fecha_hora, cliente_id, caja_id, usuario_id,
       tipo, subtotal_gravado, subtotal_exento, total_itbis, total, monto_pagado, cambio,
       estado, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      "fac-demo",
      1,
      ts,
      "cli-demo",
      "caja-1",
      "usuario-admin",
      "normal",
      84.75,
      0,
      15.25,
      100.0,
      100.0,
      0,
      "cobrada",
      ts,
      ts,
    ],
  );

  await db.run(
    `INSERT INTO factura_linea (id, factura_id, producto_id, descripcion, cantidad,
       precio_unitario, es_mayoreo, impuesto_tipo, tasa_impuesto, monto_itbis, subtotal,
       created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ["lin-demo-1", "fac-demo", "prod-arroz", "Arroz Selecto 5 lb", 2, 50.0, 0, "itbis18", 0.18, 15.25, 100.0, ts, ts],
  );

  await db.run(
    `INSERT INTO pago (id, factura_id, metodo, monto, created_at, updated_at)
     VALUES (?,?,?,?,?,?)`,
    ["pago-demo-1", "fac-demo", "efectivo", 100.0, ts, ts],
  );
}
