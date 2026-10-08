import { describe, expect, it } from "vitest";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { erroresContraXsd } from "./xsd.js";
import {
  compraInformalPrueba,
  consumoPrueba,
  creditoFiscalPrueba,
  gastoMenorPrueba,
  gubernamentalPrueba,
  notaCreditoPrueba,
  notaDebitoPrueba,
  pagoExteriorPrueba,
  exportacionPrueba,
  regimenEspecialPrueba,
} from "./datos-prueba.js";

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

describe("XML e-CF 33 (nota de débito)", () => {
  it("cumple el XSD oficial y referencia el comprobante modificado", async () => {
    const xml = construirXmlEcf(notaDebitoPrueba(), FIRMA);

    expect(xml).toContain(
      "<InformacionReferencia><NCFModificado>E310000000001</NCFModificado>" +
        "<FechaNCFModificado>25-09-2026</FechaNCFModificado><CodigoModificacion>3</CodigoModificacion>" +
        "<RazonModificacion>Interés por pago tardío</RazonModificacion></InformacionReferencia>",
    );
    expect(await erroresContraXsd(firmado(xml), "ecf-33")).toEqual([]);
  });

  it("lleva el vencimiento de la secuencia y no el indicador de nota de crédito ni formas de pago", () => {
    const xml = construirXmlEcf(notaDebitoPrueba(), FIRMA);

    expect(valorDe(xml, "FechaVencimientoSecuencia")).toBe("31-12-2027");
    expect(xml).not.toContain("IndicadorNotaCredito");
    expect(xml).not.toContain("TablaFormasPago");
    expect(valorDe(xml, "TipoeCF")).toBe("33");
  });

  it("desglosa el ITBIS del cargo adicional", () => {
    const xml = construirXmlEcf(notaDebitoPrueba(), FIRMA);

    expect(valorDe(xml, "MontoGravadoI1")).toBe("50.00");
    expect(valorDe(xml, "TotalITBIS")).toBe("9.00");
    expect(valorDe(xml, "MontoTotal")).toBe("59.00");
  });

  it("sin comprador omite el bloque Comprador", () => {
    expect(construirXmlEcf(notaDebitoPrueba(), FIRMA)).not.toContain("<Comprador>");
  });

  it("se niega a construir una nota de débito sin referencia", () => {
    expect(() => construirXmlEcf(notaDebitoPrueba({ referencia: null }), FIRMA)).toThrow(/referencia/i);
  });

  it("se niega a construir una nota de débito sin vencimiento de secuencia", () => {
    expect(() => construirXmlEcf(notaDebitoPrueba({ fechaVencimientoSecuencia: null }), FIRMA)).toThrow(/vencimiento/i);
  });
});

describe("XML e-CF 45 (gubernamental)", () => {
  it("cumple el XSD oficial con comprador, vencimiento de secuencia y ITBIS normal", async () => {
    const xml = construirXmlEcf(gubernamentalPrueba(), FIRMA);

    expect(valorDe(xml, "TipoeCF")).toBe("45");
    expect(valorDe(xml, "FechaVencimientoSecuencia")).toBe("31-12-2027");
    expect(valorDe(xml, "RNCComprador")).toBe("401000001");
    expect(valorDe(xml, "RazonSocialComprador")).toBe("MINISTERIO EJEMPLO");
    expect(valorDe(xml, "TotalITBIS")).toBe("36.00");
    expect(xml).toContain("<TablaFormasPago>");
    expect(await erroresContraXsd(firmado(xml), "ecf-45")).toEqual([]);
  });

  it("se niega a construir un E45 sin RNC o sin razón social del comprador", () => {
    expect(() => construirXmlEcf(gubernamentalPrueba({ receptorDocumentoNumero: null }), FIRMA)).toThrow(/RNC/);
    expect(() => construirXmlEcf(gubernamentalPrueba({ receptorNombre: null }), FIRMA)).toThrow(/razón social/);
  });

  it("se niega a construir un E45 sin vencimiento de secuencia", () => {
    expect(() => construirXmlEcf(gubernamentalPrueba({ fechaVencimientoSecuencia: null }), FIRMA)).toThrow(
      /vencimiento/i,
    );
  });
});

describe("XML e-CF 41 (compras a proveedores sin comprobante)", () => {
  it("cumple el XSD oficial con el proveedor como comprador y las retenciones por línea", async () => {
    const xml = construirXmlEcf(compraInformalPrueba(), FIRMA);

    expect(valorDe(xml, "FechaVencimientoSecuencia")).toBe("31-12-2027");
    expect(valorDe(xml, "RNCComprador")).toBe("101010101");
    expect(valorDe(xml, "RazonSocialComprador")).toBe("PLOMERO EJEMPLO SRL");
    expect(xml).not.toContain("TipoIngresos");
    expect(xml).not.toContain("TablaFormasPago");
    expect(await erroresContraXsd(firmado(xml), "ecf-41")).toEqual([]);
  });

  it("cada ítem declara la retención: un servicio lleva ISR y un ítem exento lleva ITBIS retenido en cero", () => {
    const xml = construirXmlEcf(compraInformalPrueba(), FIRMA);

    expect(xml).toContain(
      "<IndicadorFacturacion>1</IndicadorFacturacion><Retencion>" +
        "<IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>" +
        "<MontoITBISRetenido>54.00</MontoITBISRetenido><MontoISRRetenido>50.00</MontoISRRetenido></Retencion>" +
        "<NombreItem>Reparación de tubería</NombreItem><IndicadorBienoServicio>2</IndicadorBienoServicio>",
    );
    expect(xml).toContain(
      "<IndicadorFacturacion>4</IndicadorFacturacion><Retencion>" +
        "<IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>" +
        "<MontoITBISRetenido>0.00</MontoITBISRetenido></Retencion>" +
        "<NombreItem>Llave de paso</NombreItem><IndicadorBienoServicio>1</IndicadorBienoServicio>",
    );
  });

  it("un ítem gravado sin ITBIS retenido declara cero de forma explícita y el total lo suma", async () => {
    const lineas = compraInformalPrueba().lineas.map((l, i) =>
      i === 0 ? { ...l, itbisRetenido: undefined, isrRetenido: undefined } : l,
    );
    const xml = construirXmlEcf(compraInformalPrueba({ lineas }), FIRMA);

    expect(xml).toContain(
      "<IndicadorAgenteRetencionoPercepcion>1</IndicadorAgenteRetencionoPercepcion>" +
        "<MontoITBISRetenido>0.00</MontoITBISRetenido></Retencion><NombreItem>Reparación de tubería",
    );
    expect(valorDe(xml, "TotalITBISRetenido")).toBe("0.00");
    expect(xml).not.toContain("TotalISRRetencion");
    expect(await erroresContraXsd(firmado(xml), "ecf-41")).toEqual([]);
  });

  it("totaliza el ITBIS y el ISR retenidos", () => {
    const xml = construirXmlEcf(compraInformalPrueba(), FIRMA);

    expect(valorDe(xml, "TotalITBISRetenido")).toBe("54.00");
    expect(valorDe(xml, "TotalISRRetencion")).toBe("50.00");
    expect(valorDe(xml, "MontoTotal")).toBe("1230.00");
  });

  it("se niega a retener ISR en un bien", () => {
    const lineas = compraInformalPrueba().lineas.map((l, i) => (i === 1 ? { ...l, isrRetenido: 5 } : l));
    expect(() => construirXmlEcf(compraInformalPrueba({ lineas }), FIRMA)).toThrow(/ISR.*servicio/i);
  });

  it("se niega a construir un E41 sin RNC o razón social del proveedor", () => {
    expect(() => construirXmlEcf(compraInformalPrueba({ receptorDocumentoNumero: null }), FIRMA)).toThrow(/RNC/);
    expect(() => construirXmlEcf(compraInformalPrueba({ receptorNombre: null }), FIRMA)).toThrow(/razón social/);
  });
});

describe("XML e-CF 43 (gastos menores)", () => {
  it("cumple el XSD oficial, sin comprador ni tipo de ingresos, con el ítem exento", async () => {
    const xml = construirXmlEcf(gastoMenorPrueba(), FIRMA);

    expect(xml).not.toContain("Comprador");
    expect(xml).not.toContain("TipoIngresos");
    expect(valorDe(xml, "FechaVencimientoSecuencia")).toBe("31-12-2027");
    expect(valorDe(xml, "MontoExento")).toBe("350.00");
    expect(valorDe(xml, "MontoTotal")).toBe("350.00");
    expect(await erroresContraXsd(firmado(xml), "ecf-43")).toEqual([]);
  });

  it("se niega a construir un E43 con una línea gravada", () => {
    const lineas = [{ descripcion: "Café", cantidad: 1, precioUnitario: 118, tasaImpuesto: 0.18, subtotal: 118 }];
    expect(() => construirXmlEcf(gastoMenorPrueba({ lineas }), FIRMA)).toThrow(/exent/i);
  });
});

describe("XML e-CF 47 (pagos al exterior)", () => {
  it("cumple el XSD oficial con el proveedor extranjero identificado y el ISR retenido", async () => {
    const xml = construirXmlEcf(pagoExteriorPrueba(), FIRMA);

    expect(valorDe(xml, "IdentificadorExtranjero")).toBe("PA1234567");
    expect(valorDe(xml, "RazonSocialComprador")).toBe("ACME LLC");
    expect(xml).not.toContain("RNCComprador");
    expect(valorDe(xml, "MontoISRRetenido")).toBe("2700.00");
    expect(valorDe(xml, "TotalISRRetencion")).toBe("2700.00");
    expect(valorDe(xml, "MontoExento")).toBe("10000.00");
    expect(await erroresContraXsd(firmado(xml), "ecf-47")).toEqual([]);
  });

  it("se niega a construir un E47 sin el ISR retenido en cada línea", () => {
    const lineas = [
      { descripcion: "Licencia", cantidad: 1, precioUnitario: 100, tasaImpuesto: 0, subtotal: 100, esServicio: true },
    ];
    expect(() => construirXmlEcf(pagoExteriorPrueba({ lineas }), FIRMA)).toThrow(/ISR/);
  });

  it("se niega a retener ISR en un pago que no se declara como servicio", () => {
    const lineas = pagoExteriorPrueba().lineas.map((l) => ({ ...l, esServicio: undefined }));
    expect(() => construirXmlEcf(pagoExteriorPrueba({ lineas }), FIRMA)).toThrow(/ISR.*servicio/i);
  });

  it("se niega a construir un E47 con una línea gravada", () => {
    const lineas = [
      {
        descripcion: "Licencia",
        cantidad: 1,
        precioUnitario: 118,
        tasaImpuesto: 0.18,
        subtotal: 118,
        esServicio: true,
        isrRetenido: 10,
      },
    ];
    expect(() => construirXmlEcf(pagoExteriorPrueba({ lineas }), FIRMA)).toThrow(/exent/i);
  });
});

describe("tipos de e-CF desconocidos", () => {
  it("se niega a construir un tipo sin perfil en lugar de generar un XML inválido", () => {
    const desconocido = consumoPrueba({ tipoEcf: "99" as never, ncf: "E990000000001" });
    expect(() => construirXmlEcf(desconocido, FIRMA)).toThrow(/E99.*no se puede emitir/i);
  });
});

describe("XML e-CF 44 (regímenes especiales)", () => {
  it("cumple el XSD oficial con todo exento de ITBIS y el comprador identificado", async () => {
    const xml = construirXmlEcf(regimenEspecialPrueba(), FIRMA);

    expect(valorDe(xml, "TipoeCF")).toBe("44");
    expect(valorDe(xml, "FechaVencimientoSecuencia")).toBe("31-12-2027");
    expect(valorDe(xml, "RNCComprador")).toBe("131880681");
    expect(valorDe(xml, "MontoExento")).toBe("4750.00");
    expect(valorDe(xml, "MontoTotal")).toBe("4750.00");
    expect(xml).not.toContain("IndicadorMontoGravado");
    expect(xml).not.toContain("MontoGravadoTotal");
    expect(xml).not.toContain("TotalITBIS");
    expect(await erroresContraXsd(firmado(xml), "ecf-44")).toEqual([]);
  });

  it("marca cada ítem como exento (indicador 4)", () => {
    const xml = construirXmlEcf(regimenEspecialPrueba(), FIRMA);
    expect(xml.match(/<IndicadorFacturacion>4<\/IndicadorFacturacion>/g)).toHaveLength(2);
  });

  it("se niega a construir un E44 con un ítem gravado, sin comprador o sin vencimiento de secuencia", () => {
    const gravado = regimenEspecialPrueba().lineas.map((l) => ({ ...l, tasaImpuesto: 0.18 }));
    expect(() => construirXmlEcf(regimenEspecialPrueba({ lineas: gravado }), FIRMA)).toThrow(/exentos/);
    expect(() => construirXmlEcf(regimenEspecialPrueba({ receptorDocumentoNumero: null }), FIRMA)).toThrow(/RNC/);
    expect(() => construirXmlEcf(regimenEspecialPrueba({ fechaVencimientoSecuencia: null }), FIRMA)).toThrow(
      /vencimiento/i,
    );
  });
});

describe("XML e-CF 46 (exportaciones)", () => {
  it("cumple el XSD oficial con ítems gravados a tasa 0% (indicador 3)", async () => {
    const xml = construirXmlEcf(exportacionPrueba(), FIRMA);

    expect(valorDe(xml, "TipoeCF")).toBe("46");
    expect(valorDe(xml, "MontoGravadoTotal")).toBe("117500.00");
    expect(valorDe(xml, "MontoGravadoI3")).toBe("117500.00");
    expect(valorDe(xml, "ITBIS3")).toBe("0");
    expect(valorDe(xml, "TotalITBIS")).toBe("0.00");
    expect(valorDe(xml, "TotalITBIS3")).toBe("0.00");
    expect(valorDe(xml, "MontoTotal")).toBe("117500.00");
    expect(xml).not.toContain("MontoExento");
    expect(xml).not.toContain("IndicadorMontoGravado");
    expect(await erroresContraXsd(firmado(xml), "ecf-46")).toEqual([]);
  });

  it("marca cada ítem con el indicador 3", () => {
    const xml = construirXmlEcf(exportacionPrueba(), FIRMA);
    expect(xml.match(/<IndicadorFacturacion>3<\/IndicadorFacturacion>/g)).toHaveLength(2);
  });

  it("se niega a construir un E46 con un ítem con ITBIS, sin comprador o sin vencimiento de secuencia", () => {
    const gravado = exportacionPrueba().lineas.map((l) => ({ ...l, tasaImpuesto: 0.18 }));
    expect(() => construirXmlEcf(exportacionPrueba({ lineas: gravado }), FIRMA)).toThrow(/tasa 0/);
    expect(() => construirXmlEcf(exportacionPrueba({ receptorNombre: null }), FIRMA)).toThrow(/razón social/);
    expect(() => construirXmlEcf(exportacionPrueba({ fechaVencimientoSecuencia: null }), FIRMA)).toThrow(
      /vencimiento/i,
    );
  });
});
