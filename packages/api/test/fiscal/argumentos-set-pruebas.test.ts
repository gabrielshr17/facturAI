import { describe, expect, it } from "vitest";
import { leerArgumentosSetPruebas } from "../../src/fiscal/certificacion/argumentos.js";

describe("argumentos de set-pruebas", () => {
  it("acepta --salida antes o después del archivo", () => {
    expect(leerArgumentosSetPruebas(["--salida", "out", "set.xlsx"])).toEqual({
      archivo: "set.xlsx",
      salida: "out",
      enviar: false,
    });
    expect(leerArgumentosSetPruebas(["set.xlsx", "--enviar", "--salida", "out"])).toEqual({
      archivo: "set.xlsx",
      salida: "out",
      enviar: true,
    });
  });

  it("usa la carpeta por defecto y reporta si falta el archivo", () => {
    expect(leerArgumentosSetPruebas(["set.xlsx"])).toEqual({
      archivo: "set.xlsx",
      salida: "set-pruebas-salida",
      enviar: false,
    });
    expect(leerArgumentosSetPruebas(["--salida", "out"]).archivo).toBeNull();
  });
});
