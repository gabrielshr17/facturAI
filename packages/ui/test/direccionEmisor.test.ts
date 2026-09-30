import { describe, expect, it } from "vitest";
import { lineasDireccionEmisor } from "../src/impresion/representacion.js";

describe("dirección del emisor en la representación impresa", () => {
  it("muestra la dirección y debajo el municipio y la provincia", () => {
    expect(
      lineasDireccionEmisor({ direccion: "Calle Principal #1", municipio: "Santo Domingo Este", provincia: "Santo Domingo" }),
    ).toEqual(["Calle Principal #1", "Municipio: Santo Domingo Este", "Provincia: Santo Domingo"]);
  });

  it("omite lo que no está cargado", () => {
    expect(lineasDireccionEmisor({ direccion: "Calle 1", municipio: null, provincia: "Santiago" })).toEqual([
      "Calle 1",
      "Provincia: Santiago",
    ]);
    expect(lineasDireccionEmisor({ direccion: null })).toEqual([]);
  });
});
