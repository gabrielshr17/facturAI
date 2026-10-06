import { describe, expect, it } from "vitest";
import { cargarEsquema } from "../../src/fiscal/certificacion/esquema.js";
import { generarXmlDesdeFila, aplanarXml } from "../../src/fiscal/certificacion/generador.js";
import { construirXmlEcf } from "../../src/fiscal/xml/ecf.js";
import { cargarCertificado, firmarXml } from "../../src/fiscal/firma.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";
import { erroresContraXsd } from "./xsd.js";
import { creditoFiscalPrueba, notaCreditoPrueba } from "./datos-prueba.js";

const FIRMA = new Date("2026-10-01T18:31:05.000Z");
const firmado = (xml: string) => firmarXml(xml, cargarCertificado(certificadoPrueba().p12, CLAVE_P12_PRUEBA));

describe("generador fila → XML (set de pruebas DGII)", () => {
  it("reconstruye exactamente un E31 a partir de su fila aplanada", () => {
    const original = construirXmlEcf(
      creditoFiscalPrueba({
        pagos: [
          { metodo: "efectivo", monto: 86 },
          { metodo: "tarjeta", monto: 200 },
        ],
      }),
      FIRMA,
    );
    const esquema = cargarEsquema("ecf-31");
    const fila = aplanarXml(esquema, original);

    expect(fila["NombreItem[2]"]).toBe("Plátano verde");
    expect(fila["FormaPago[2]"]).toBe("3");
    expect(generarXmlDesdeFila(esquema, fila).xml).toBe(original);
  });

  it("reconstruye una nota de crédito con su referencia", () => {
    const original = construirXmlEcf(notaCreditoPrueba(), FIRMA);
    const esquema = cargarEsquema("ecf-34");
    expect(generarXmlDesdeFila(esquema, aplanarXml(esquema, original)).xml).toBe(original);
  });

  it("ordena según el XSD aunque la fila venga desordenada, omite vacíos y cumple el XSD", async () => {
    const fila: Record<string, string> = {
      FechaHoraFirma: "01-10-2026 14:31:05",
      "MontoItem[1]": "100.00",
      "PrecioUnitarioItem[1]": "100.00",
      "CantidadItem[1]": "1",
      "IndicadorBienoServicio[1]": "2",
      "NombreItem[1]": "Servicio de flete",
      "IndicadorFacturacion[1]": "4",
      "NumeroLinea[1]": "1",
      MontoTotal: "100.00",
      MontoExento: "100.00",
      RazonSocialComprador: "FERRETERIA EJEMPLO SRL",
      RNCComprador: "101010101",
      FechaEmision: "01-10-2026",
      DireccionEmisor: "Calle 1",
      RazonSocialEmisor: "SUPLIDORA MAROHI SRL",
      RNCEmisor: "131880738",
      TipoPago: "1",
      TipoIngresos: "01",
      FechaVencimientoSecuencia: "31-12-2027",
      eNCF: "E310000000005",
      TipoeCF: "31",
      Version: "1.0",
      NombreComercial: "   ",
    };

    const { xml, columnasSinUsar } = generarXmlDesdeFila(cargarEsquema("ecf-31"), fila);

    expect(columnasSinUsar).toEqual([]);
    expect(xml).not.toContain("NombreComercial");
    expect(xml.indexOf("<Encabezado>")).toBeLessThan(xml.indexOf("<DetallesItems>"));
    expect(await erroresContraXsd(firmado(xml), "ecf-31")).toEqual([]);
  });

  it("distingue NumeroLinea de ítems y de descuentos por el nombre del padre", () => {
    const { xml } = generarXmlDesdeFila(cargarEsquema("ecf-32"), {
      "NumeroLinea[1]": "1",
      "NombreItem[1]": "Arroz",
      "DescuentoORecargo.NumeroLinea[1]": "1",
      "TipoAjuste[1]": "D",
    });
    expect(xml).toContain("<Item><NumeroLinea>1</NumeroLinea><NombreItem>Arroz</NombreItem></Item>");
    expect(xml).toContain(
      "<DescuentoORecargo><NumeroLinea>1</NumeroLinea><TipoAjuste>D</TipoAjuste></DescuentoORecargo>",
    );
  });

  it("reporta las columnas que no corresponden a ningún campo del XSD", () => {
    const { columnasSinUsar } = generarXmlDesdeFila(cargarEsquema("acecf"), {
      Version: "1.0",
      CasoPrueba: "7",
      "NombreInventado[1]": "x",
    });
    expect(columnasSinUsar.sort()).toEqual(["CasoPrueba", "NombreInventado[1]"]);
  });
});
