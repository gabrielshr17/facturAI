import { describe, expect, it } from "vitest";
import type { Cliente, ComprobanteFiscal, Factura, SecuenciaNcf } from "@sfr/core";
import { datosReciboNotaGuardada, lineasDesdeXml } from "../src/impresion/representacion.js";

const XML =
  "<ECF><Encabezado></Encabezado><DetallesItems>" +
  "<Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>1</IndicadorFacturacion><NombreItem>Arroz &amp; Sal</NombreItem>" +
  "<IndicadorBienoServicio>1</IndicadorBienoServicio><CantidadItem>2.00</CantidadItem><PrecioUnitarioItem>59.00</PrecioUnitarioItem><MontoItem>118.00</MontoItem></Item>" +
  "<Item><NumeroLinea>2</NumeroLinea><IndicadorFacturacion>4</IndicadorFacturacion><NombreItem>Plátano</NombreItem>" +
  "<IndicadorBienoServicio>1</IndicadorBienoServicio><CantidadItem>1.00</CantidadItem><PrecioUnitarioItem>50.00</PrecioUnitarioItem><MontoItem>50.00</MontoItem></Item>" +
  "</DetallesItems><InformacionReferencia><NCFModificado>E320000000001</NCFModificado><FechaNCFModificado>25-09-2026</FechaNCFModificado>" +
  "<CodigoModificacion>3</CodigoModificacion></InformacionReferencia></ECF>";

describe("reimpresión de una nota guardada", () => {
  it("reconstruye las líneas desde el XML firmado con su tasa y su ITBIS", () => {
    expect(lineasDesdeXml(XML)).toEqual([
      {
        descripcion: "Arroz & Sal",
        cantidad: 2,
        precio_unitario: 59,
        subtotal: 118,
        tasa_impuesto: 0.18,
        monto_itbis: 18,
      },
      { descripcion: "Plátano", cantidad: 1, precio_unitario: 50, subtotal: 50, tasa_impuesto: 0, monto_itbis: 0 },
    ]);
  });

  it("sin XML no hay líneas", () => {
    expect(lineasDesdeXml(null)).toEqual([]);
  });

  it("arma el recibo de la nota con sus líneas y la referencia", async () => {
    const nota = {
      tipo_ecf: "34",
      ncf: "E340000000001",
      secuencia_id: "s",
      fecha_emision: "2026-10-05T14:00:00.000Z",
      monto_gravado: 100,
      monto_exento: 50,
      monto_itbis: 18,
      total: 168,
      xml_firmado: XML,
    } as ComprobanteFiscal;

    const datos = await datosReciboNotaGuardada({
      nota,
      factura: { numero_interno: 7 } as Factura,
      cliente: null as Cliente | null,
      negocio: { nombre_comercial: "M", rnc: null, direccion: null, telefono: null, ancho_impresora_default: 80 },
      secuencias: {
        async obtener(): Promise<SecuenciaNcf | undefined> {
          return undefined;
        },
      },
    });

    expect(datos.lineas).toHaveLength(2);
    expect(datos.factura).toMatchObject({ numero_interno: 7, total: 168, subtotal_exento: 50 });
    expect(datos.comprobante?.referencia?.ncfModificado).toBe("E320000000001");
  });
});
