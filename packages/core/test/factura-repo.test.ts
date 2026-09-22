import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import { crearFacturaRepo, crearProductoRepo, crearClienteRepo, ValidacionError } from "../src/index.js";

async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

describe("facturaRepo — armar ticket (§7.1)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("abre un ticket con totales en cero y numeración incremental", async () => {
    const repo = crearFacturaRepo(db);
    const t1 = await repo.abrirTicket();
    const t2 = await repo.abrirTicket();
    expect(t1.estado).toBe("abierta");
    expect(t1.total).toBe(0);
    expect(t2.numero_interno).toBe(t1.numero_interno + 1);
  });

  it("agrega líneas (producto registrado y no registrado) y recalcula totales", async () => {
    const repo = crearFacturaRepo(db);
    const productos = crearProductoRepo(db);
    const t = await repo.abrirTicket();
    const producto = await productos.crear({ descripcion: "Arroz 5lb" });

    await repo.agregarLinea(t.id, {
      producto_id: producto.id,
      descripcion: "Arroz 5lb",
      cantidad: 2,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await repo.agregarLinea(t.id, {
      producto_id: null, // artículo no registrado
      descripcion: "Producto suelto",
      cantidad: 1,
      precioUnitario: 30,
      impuestoTipo: "exento",
      tasaImpuesto: 0,
    });

    const lineas = await repo.obtenerLineas(t.id);
    expect(lineas).toHaveLength(2);

    const factura = await repo.obtener(t.id);
    // 2×50 (ITBIS incl.) = 100 → gravado 84.75 + itbis 15.25; + exento 30 = total 130
    expect(factura?.total).toBe(130);
    expect(factura?.subtotal_exento).toBe(30);
    expect(factura?.total_itbis).toBe(15.25);
  });

  it("cambiar cantidad (sumar/restar) recalcula totales", async () => {
    const repo = crearFacturaRepo(db);
    const t = await repo.abrirTicket();
    const l = await repo.agregarLinea(t.id, {
      descripcion: "Refresco",
      cantidad: 1,
      precioUnitario: 60,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });

    await repo.actualizarCantidadLinea(l.id, 3);
    const factura = await repo.obtener(t.id);
    expect(factura?.total).toBe(180);

    await expect(repo.actualizarCantidadLinea(l.id, 0)).rejects.toBeInstanceOf(ValidacionError);
  });

  it("borrar línea recalcula totales (borrado lógico)", async () => {
    const repo = crearFacturaRepo(db);
    const t = await repo.abrirTicket();
    const l1 = await repo.agregarLinea(t.id, {
      descripcion: "A",
      cantidad: 1,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await repo.agregarLinea(t.id, {
      descripcion: "B",
      cantidad: 1,
      precioUnitario: 20,
      impuestoTipo: "exento",
      tasaImpuesto: 0,
    });

    await repo.eliminarLinea(l1.id);
    const lineas = await repo.obtenerLineas(t.id);
    expect(lineas).toHaveLength(1);
    const factura = await repo.obtener(t.id);
    expect(factura?.total).toBe(20);
  });

  it("restaurar línea revierte el borrado lógico y recalcula (§ deshacer en Ventas)", async () => {
    const repo = crearFacturaRepo(db);
    const t = await repo.abrirTicket();
    const l1 = await repo.agregarLinea(t.id, {
      descripcion: "A",
      cantidad: 2,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await repo.agregarLinea(t.id, {
      descripcion: "B",
      cantidad: 1,
      precioUnitario: 20,
      impuestoTipo: "exento",
      tasaImpuesto: 0,
    });

    await repo.eliminarLinea(l1.id);
    await repo.restaurarLinea(l1.id);

    const lineas = await repo.obtenerLineas(t.id);
    expect(lineas).toHaveLength(2);
    const restaurada = lineas.find((l) => l.id === l1.id);
    expect(restaurada?.cantidad).toBe(2);
    expect(restaurada?.precio_unitario).toBe(50);
    const factura = await repo.obtener(t.id);
    expect(factura?.total).toBe(120);
  });

  it("asigna cliente y notas al ticket", async () => {
    const repo = crearFacturaRepo(db);
    const clientes = crearClienteRepo(db);
    const t = await repo.abrirTicket();
    const cliente = await clientes.crear({ nombre: "Juan" });
    await repo.asignarCliente(t.id, cliente.id);
    await repo.actualizarNotas(t.id, "sin bolsa");
    const factura = await repo.obtener(t.id);
    expect(factura?.cliente_id).toBe(cliente.id);
    expect(factura?.notas).toBe("sin bolsa");
  });

  it("lista solo tickets abiertos", async () => {
    const repo = crearFacturaRepo(db);
    const t1 = await repo.abrirTicket();
    await repo.abrirTicket();
    await repo.eliminarTicket(t1.id);

    const abiertos = await repo.listarAbiertos();
    expect(abiertos).toHaveLength(1);
    expect(await repo.obtener(t1.id)).toBeUndefined();
  });

  it("rechaza línea con descripción vacía o cantidad inválida", async () => {
    const repo = crearFacturaRepo(db);
    const t = await repo.abrirTicket();
    await expect(
      repo.agregarLinea(t.id, {
        descripcion: "  ",
        cantidad: 1,
        precioUnitario: 10,
        impuestoTipo: "exento",
        tasaImpuesto: 0,
      }),
    ).rejects.toBeInstanceOf(ValidacionError);
    await expect(
      repo.agregarLinea(t.id, {
        descripcion: "X",
        cantidad: 0,
        precioUnitario: 10,
        impuestoTipo: "exento",
        tasaImpuesto: 0,
      }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });
});

describe("facturaRepo — cobrar (§7.2)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function ticketCon100(repo: ReturnType<typeof crearFacturaRepo>) {
    const t = await repo.abrirTicket();
    await repo.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 2,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    return t;
  }

  it("cobra en efectivo exacto: sin cambio, queda 'cobrada'", async () => {
    const repo = crearFacturaRepo(db);
    const t = await ticketCon100(repo);

    const { factura, cambio } = await repo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 100 }] });
    expect(factura.estado).toBe("cobrada");
    expect(factura.monto_pagado).toBe(100);
    expect(cambio).toBe(0);
    expect(await repo.listarAbiertos()).toHaveLength(0);
  });

  it("cobra con efectivo de más y calcula el cambio al centavo", async () => {
    const repo = crearFacturaRepo(db);
    const t = await ticketCon100(repo);

    const { cambio } = await repo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 150 }] });
    expect(cambio).toBe(50);
  });

  it("cobra con pago mixto (tarjeta + efectivo) y registra ambos pagos", async () => {
    const repo = crearFacturaRepo(db);
    const t = await ticketCon100(repo);

    await repo.cobrar(t.id, {
      pagos: [
        { metodo: "tarjeta", monto: 60 },
        { metodo: "efectivo", monto: 40 },
      ],
    });
    const pagos = await repo.obtenerPagos(t.id);
    expect(pagos).toHaveLength(2);
    expect(pagos.reduce((s, p) => s + p.monto, 0)).toBe(100);
  });

  it("rechaza cobro insuficiente con el faltante exacto", async () => {
    const repo = crearFacturaRepo(db);
    const t = await ticketCon100(repo);

    await expect(repo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 70 }] })).rejects.toThrow(/30\.00/);
  });

  it("rechaza cobrar un ticket sin artículos", async () => {
    const repo = crearFacturaRepo(db);
    const t = await repo.abrirTicket();
    await expect(repo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 0 }] })).rejects.toBeInstanceOf(
      ValidacionError,
    );
  });

  it("rechaza cobrar dos veces el mismo ticket", async () => {
    const repo = crearFacturaRepo(db);
    const t = await ticketCon100(repo);
    await repo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 100 }] });
    await expect(repo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 100 }] })).rejects.toBeInstanceOf(
      ValidacionError,
    );
  });

  it("obtenerUltimaCobrada devuelve la más reciente cobrada", async () => {
    const repo = crearFacturaRepo(db);
    const t1 = await ticketCon100(repo);
    await repo.cobrar(t1.id, { pagos: [{ metodo: "efectivo", monto: 100 }] });

    // Pequeño margen para garantizar timestamps distintos (evita empate por resolución de milisegundos).
    await new Promise((r) => setTimeout(r, 5));

    const t2 = await ticketCon100(repo);
    await repo.cobrar(t2.id, { pagos: [{ metodo: "efectivo", monto: 100 }] });

    const ultima = await repo.obtenerUltimaCobrada();
    expect(ultima?.id).toBe(t2.id);
  });
});

describe("facturaRepo — listarCobradas (Consulta de facturas)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function cobrarTicket(repo: ReturnType<typeof crearFacturaRepo>, clienteId: string | null) {
    const t = await repo.abrirTicket({ cliente_id: clienteId });
    await repo.agregarLinea(t.id, {
      descripcion: "Arroz",
      cantidad: 1,
      precioUnitario: 50,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    const { factura } = await repo.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 50 }] });
    return factura;
  }

  it("solo incluye facturas cobradas, no las abiertas", async () => {
    const repo = crearFacturaRepo(db);
    await repo.abrirTicket();
    const cobrada = await cobrarTicket(repo, null);

    const lista = await repo.listarCobradas();
    expect(lista.map((f) => f.id)).toEqual([cobrada.id]);
  });

  it("filtra por cliente", async () => {
    const repo = crearFacturaRepo(db);
    const clientes = crearClienteRepo(db);
    const juan = await clientes.crear({ nombre: "Juan" });
    const maria = await clientes.crear({ nombre: "María" });

    const deJuan = await cobrarTicket(repo, juan.id);
    await cobrarTicket(repo, maria.id);

    const lista = await repo.listarCobradas({ clienteId: juan.id });
    expect(lista.map((f) => f.id)).toEqual([deJuan.id]);
  });

  it("filtra por tipo (normal vs fiscal)", async () => {
    const repo = crearFacturaRepo(db);
    const normal = await cobrarTicket(repo, null);

    const soloNormales = await repo.listarCobradas({ tipo: "normal" });
    expect(soloNormales.map((f) => f.id)).toEqual([normal.id]);

    const soloFiscales = await repo.listarCobradas({ tipo: "fiscal" });
    expect(soloFiscales).toHaveLength(0);
  });

  it("ordena de más reciente a más antigua", async () => {
    const repo = crearFacturaRepo(db);
    const t1 = await cobrarTicket(repo, null);
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await cobrarTicket(repo, null);

    const lista = await repo.listarCobradas();
    expect(lista.map((f) => f.id)).toEqual([t2.id, t1.id]);
  });
});
