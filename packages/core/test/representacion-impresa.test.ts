import { describe, it, expect, beforeEach } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import type { SqlDriver } from "../src/db/driver.js";
import {
  NOMBRE_TIPO_ECF,
  DESCRIPCION_CODIGO_MODIFICACION,
  requiereVencimientoEnRepresentacion,
  crearFacturaRepo,
  crearSecuenciaNcfRepo,
  crearComprobanteFiscalRepo,
  crearNcfAnulacionRepo,
  cobrarConFiscal,
  type ProveedorFiscal,
} from "../src/index.js";

describe("representación impresa (Informe Técnico e-CF §18)", () => {
  it("usa la denominación oficial del tipo de e-CF", () => {
    expect(NOMBRE_TIPO_ECF["31"]).toBe("Factura de Crédito Fiscal Electrónica");
    expect(NOMBRE_TIPO_ECF["32"]).toBe("Factura de Consumo Electrónica");
    expect(NOMBRE_TIPO_ECF["34"]).toBe("Nota de Crédito Electrónica");
    expect(NOMBRE_TIPO_ECF["44"]).toBe("Comprobante Electrónico para Regímenes Especiales");
    expect(NOMBRE_TIPO_ECF["46"]).toBe("Comprobante Electrónico para Exportaciones");
  });

  it("describe en palabras el código de modificación", () => {
    expect(DESCRIPCION_CODIGO_MODIFICACION[1]).toBe("Anula el NCF modificado");
    expect(DESCRIPCION_CODIGO_MODIFICACION[3]).toBe("Corrige montos del NCF modificado");
  });

  it("la fecha de vencimiento de la secuencia no se imprime en notas de crédito ni consumo", () => {
    expect(requiereVencimientoEnRepresentacion("31")).toBe(true);
    expect(requiereVencimientoEnRepresentacion("32")).toBe(false);
    expect(requiereVencimientoEnRepresentacion("34")).toBe(false);
  });
});

describe("el comprobante guarda la razón social del comprador para reimprimirla", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = createNodeSqliteDriver();
    await migrate(db);
  });

  it("cobrarConFiscal persiste receptor_nombre", async () => {
    const proveedor: ProveedorFiscal = { transmitir: async () => ({ estado: "aceptado" }) };
    const deps = {
      facturaRepo: crearFacturaRepo(db),
      secuenciaRepo: crearSecuenciaNcfRepo(db),
      comprobanteRepo: crearComprobanteFiscalRepo(db),
      anulacionRepo: crearNcfAnulacionRepo(db),
      proveedorFiscal: proveedor,
    };
    await deps.secuenciaRepo.crear({ tipoEcf: "31", rangoDesde: 1, rangoHasta: 10, vencimiento: "2099-12-31" });
    const t = await deps.facturaRepo.abrirTicket();
    await deps.facturaRepo.agregarLinea(t.id, {
      descripcion: "Cemento",
      cantidad: 1,
      precioUnitario: 118,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });

    const { comprobante } = await cobrarConFiscal(deps, t.id, {
      pagos: [{ metodo: "efectivo", monto: 118 }],
      tipoEcf: "31",
      receptorDocumentoTipo: "rnc",
      receptorDocumentoNumero: "101023122",
      receptorNombre: "FERRETERIA EJEMPLO SRL",
      emisor: { rnc: "131880738", razonSocial: "SUPLIDORA MAROHI SRL", nombreComercial: null, direccion: "Calle 1" },
    });

    expect((await deps.comprobanteRepo.obtener(comprobante.id))?.receptor_nombre).toBe("FERRETERIA EJEMPLO SRL");
    expect((await deps.secuenciaRepo.obtener(comprobante.secuencia_id))?.vencimiento).toBe("2099-12-31");
  });
});
