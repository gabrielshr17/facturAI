import { describe, expect, it } from "vitest";
import { documentoProveedor } from "../src/utilidades/documentoProveedor.js";

describe("documentoProveedor", () => {
  it("acepta un RNC de 9 dígitos y una cédula de 11, con o sin guiones", () => {
    expect(documentoProveedor("131880681")).toBe("131880681");
    expect(documentoProveedor("1-31-88068-1")).toBe("131880681");
    expect(documentoProveedor("402-0040322-4")).toBe("40200403224");
  });

  it("rechaza lo que no tiene 9 u 11 dígitos", () => {
    expect(documentoProveedor("")).toBeNull();
    expect(documentoProveedor("12345678")).toBeNull();
    expect(documentoProveedor("1234567890")).toBeNull();
    expect(documentoProveedor("abc")).toBeNull();
  });
});
