import { describe, expect, it } from "vitest";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { erroresContraXsd } from "./xsd.js";
import { consumoPrueba, creditoFiscalPrueba, notaCreditoPrueba } from "./datos-prueba.js";

const FIRMA = new Date("2026-10-01T18:31:05.000Z");

function firmado(xml: string): string {
  return firmarXml(xml, cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA));
}

function valorDe(xml: string, etiqueta: string): string | undefined {
  return new RegExp(`<${etiqueta}>([^<]*)</${etiqueta}>`).exec(xml)?.[1];
}

describe("XML e-CF 32 (factura de consumo)", () => {
  it("cumple el XSD oficial una vez firmado", async () => {
    const xml = construirXmlEcf(consumoPrueba(), FIRMA);
    expect(await erroresContraXsd(firmado(xml), "ecf-32")).toEqual([]);
  });

  it("desglosa gravado 18%, exento e ITBIS con el precio ITBIS incluido", () => {
    const xml = construirXmlEcf(consumoPrueba(), FIRMA);

    expect(valorDe(xml, "IndicadorMontoGravado")).toBe("1");
    expect(valorDe(xml, "MontoGravadoTotal")).toBe("200.00");
    expect(valorDe(xml, "MontoGravadoI1")).toBe("200.00");
    expect(valorDe(xml, "MontoExento")).toBe("50.00");
    expect(valorDe(xml, "ITBIS1")).toBe("18");
    expect(valorDe(xml, "TotalITBIS")).toBe("36.00");
    expect(valorDe(xml, "TotalITBIS1")).toBe("36.00");
    expect(valorDe(xml, "MontoTotal")).toBe("286.00");
    expect(xml).not.toContain("MontoGravadoI2");
  });

  it("marca cada ítem con su indicador de facturación y monto con ITBIS", () => {
    const xml = construirXmlEcf(consumoPrueba(), FIRMA);

    expect(xml).toContain(
      "<Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>1</IndicadorFacturacion>" +
        "<NombreItem>Arroz Selecto 5lb</NombreItem><IndicadorBienoServicio>1</IndicadorBienoServicio>" +
        "<CantidadItem>2.00</CantidadItem><PrecioUnitarioItem>118.00</PrecioUnitarioItem><MontoItem>236.00</MontoItem></Item>",
    );
    expect(xml).toContain("<NumeroLinea>2</NumeroLinea><IndicadorFacturacion>4</IndicadorFacturacion>");
  });

  it("usa fechas en formato DGII con hora de República Dominicana", () => {
    const xml = construirXmlEcf(consumoPrueba(), FIRMA);

    expect(valorDe(xml, "FechaEmision")).toBe("01-10-2026");
    expect(valorDe(xml, "FechaHoraFirma")).toBe("01-10-2026 14:31:05");
  });

  it("lista cada forma de pago con su código DGII", () => {
    const xml = construirXmlEcf(
      consumoPrueba({
        pagos: [
          { metodo: "efectivo", monto: 86 },
          { metodo: "tarjeta", monto: 150 },
          { metodo: "transferencia", monto: 50 },
        ],
      }),
      FIRMA,
    );

    expect(xml).toContain(
      "<TablaFormasPago><FormaDePago><FormaPago>1</FormaPago><MontoPago>86.00</MontoPago></FormaDePago>" +
        "<FormaDePago><FormaPago>3</FormaPago><MontoPago>150.00</MontoPago></FormaDePago>" +
        "<FormaDePago><FormaPago>2</FormaPago><MontoPago>50.00</MontoPago></FormaDePago></TablaFormasPago>",
    );
    expect(valorDe(xml, "TipoPago")).toBe("1");
  });

  it("una venta a crédito usa TipoPago 2", () => {
    const xml = construirXmlEcf(consumoPrueba({ pagos: [{ metodo: "credito", monto: 286 }] }), FIRMA);
    expect(valorDe(xml, "TipoPago")).toBe("2");
    expect(xml).toContain("<FormaPago>4</FormaPago>");
  });

  it("el ITBIS es la diferencia entre el monto con ITBIS y el gravado, así los totales cuadran", () => {
    const xml = construirXmlEcf(
      consumoPrueba({
        lineas: [{ descripcion: "Chicle", cantidad: 1, precioUnitario: 10, tasaImpuesto: 0.18, subtotal: 10 }],
        pagos: [{ metodo: "efectivo", monto: 10 }],
        montoGravado: 8.47,
        montoExento: 0,
        montoItbis: 1.53,
        total: 10,
      }),
      FIRMA,
    );

    expect(valorDe(xml, "MontoGravadoI1")).toBe("8.47");
    expect(valorDe(xml, "TotalITBIS1")).toBe("1.53");
    expect(valorDe(xml, "TotalITBIS")).toBe("1.53");
    expect(valorDe(xml, "MontoTotal")).toBe("10.00");
  });

  it("separa la tasa reducida de 16% en MontoGravadoI2 / ITBIS2", async () => {
    const xml = construirXmlEcf(
      consumoPrueba({
        lineas: [{ descripcion: "Yogurt", cantidad: 1, precioUnitario: 116, tasaImpuesto: 0.16, subtotal: 116 }],
        pagos: [{ metodo: "efectivo", monto: 116 }],
        montoGravado: 100,
        montoExento: 0,
        montoItbis: 16,
        total: 116,
      }),
      FIRMA,
    );

    expect(valorDe(xml, "MontoGravadoI2")).toBe("100.00");
    expect(valorDe(xml, "ITBIS2")).toBe("16");
    expect(valorDe(xml, "TotalITBIS2")).toBe("16.00");
    expect(xml).not.toContain("MontoExento");
    expect(await erroresContraXsd(firmado(xml), "ecf-32")).toEqual([]);
  });

  it("incluye el documento del comprador cuando lo hay", async () => {
    const xml = construirXmlEcf(
      consumoPrueba({
        receptorDocumentoTipo: "cedula",
        receptorDocumentoNumero: "00114272360",
        receptorNombre: "Ana Díaz",
      }),
      FIRMA,
    );
    expect(valorDe(xml, "RNCComprador")).toBe("00114272360");
    expect(valorDe(xml, "RazonSocialComprador")).toBe("Ana Díaz");
    expect(await erroresContraXsd(firmado(xml), "ecf-32")).toEqual([]);
  });

  it("escapa caracteres especiales y recorta el nombre del ítem a 80 caracteres", async () => {
    const nombreLargo = `Galletas "Tom & Jerry" <familiar> ${"x".repeat(100)}`;
    const xml = construirXmlEcf(
      consumoPrueba({
        lineas: [{ descripcion: nombreLargo, cantidad: 1, precioUnitario: 50, tasaImpuesto: 0, subtotal: 50 }],
        pagos: [{ metodo: "efectivo", monto: 50 }],
        montoGravado: 0,
        montoExento: 50,
        montoItbis: 0,
        total: 50,
      }),
      FIRMA,
    );

    expect(xml).toContain("Galletas &quot;Tom &amp; Jerry&quot; &lt;familiar&gt;");
    expect(await erroresContraXsd(firmado(xml), "ecf-32")).toEqual([]);
  });
});

describe("XML e-CF 31 (crédito fiscal)", () => {
  it("cumple el XSD oficial e incluye comprador y vencimiento de secuencia", async () => {
    const xml = construirXmlEcf(creditoFiscalPrueba(), FIRMA);

    expect(valorDe(xml, "FechaVencimientoSecuencia")).toBe("31-12-2027");
    expect(valorDe(xml, "RNCComprador")).toBe("101010101");
    expect(valorDe(xml, "RazonSocialComprador")).toBe("FERRETERIA EJEMPLO SRL");
    expect(await erroresContraXsd(firmado(xml), "ecf-31")).toEqual([]);
  });

  it("se niega a construir un E31 sin RNC del comprador", () => {
    expect(() => construirXmlEcf(creditoFiscalPrueba({ receptorDocumentoNumero: null }), FIRMA)).toThrow(/RNC/);
  });
});

describe("XML e-CF 34 (nota de crédito)", () => {
  it("cumple el XSD oficial y referencia el comprobante modificado", async () => {
    const xml = construirXmlEcf(notaCreditoPrueba(), FIRMA);

    expect(xml).toContain(
      "<InformacionReferencia><NCFModificado>E320000000001</NCFModificado>" +
        "<FechaNCFModificado>25-09-2026</FechaNCFModificado><CodigoModificacion>3</CodigoModificacion>" +
        "<RazonModificacion>Devolución de mercancía</RazonModificacion></InformacionReferencia>",
    );
    expect(await erroresContraXsd(firmado(xml), "ecf-34")).toEqual([]);
  });

  it("IndicadorNotaCredito es 0 hasta 30 días después del original y 1 después", () => {
    const dentro = construirXmlEcf(notaCreditoPrueba(), FIRMA);
    const fuera = construirXmlEcf(
      notaCreditoPrueba({
        referencia: {
          ncfModificado: "E320000000001",
          fechaNcfModificado: "2026-08-15T15:00:00.000Z",
          codigoModificacion: 3,
          razon: null,
        },
      }),
      FIRMA,
    );

    expect(valorDe(dentro, "IndicadorNotaCredito")).toBe("0");
    expect(valorDe(fuera, "IndicadorNotaCredito")).toBe("1");
    expect(fuera).not.toContain("RazonModificacion");
  });

  it("sin comprador omite el bloque Comprador (opcional en E34); en E32 va vacío porque es obligatorio", () => {
    expect(construirXmlEcf(notaCreditoPrueba(), FIRMA)).not.toContain("<Comprador>");
    expect(construirXmlEcf(consumoPrueba(), FIRMA)).toContain("<Comprador></Comprador>");
  });

  it("se niega a construir una nota de crédito sin referencia", () => {
    expect(() => construirXmlEcf(notaCreditoPrueba({ referencia: null }), FIRMA)).toThrow(/referencia/i);
  });
});
