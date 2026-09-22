import { describe, expect, it } from "vitest";
import { decodificarBase64Url, extraerCuerpo } from "../src/services/gmail.js";

function b64(texto: string): string {
  return Buffer.from(texto, "utf-8").toString("base64url");
}

describe("decodificarBase64Url", () => {
  it("decodifica texto base64url estándar", () => {
    expect(decodificarBase64Url(b64("Transferencia recibida"))).toBe("Transferencia recibida");
  });

  it("decodifica acentos y caracteres del juego español", () => {
    const texto = "Se recibió RD$ 1,250.75 del señor José";
    expect(decodificarBase64Url(b64(texto))).toBe(texto);
  });

  it("tolera el alfabeto URL-safe (guiones y guiones bajos en vez de + y /)", () => {
    const generado = b64("ab+/cd");
    expect(generado).not.toContain("+");
    expect(decodificarBase64Url(generado)).toBe("ab+/cd");
  });
});

describe("extraerCuerpo", () => {
  it("devuelve vacío si no hay parte", () => {
    expect(extraerCuerpo(undefined)).toBe("");
    expect(extraerCuerpo({ mimeType: "text/html", body: null })).toBe("");
  });

  it("devuelve el texto plano directo", () => {
    expect(extraerCuerpo({ mimeType: "text/plain", body: { data: b64("Hola banco") } })).toBe("Hola banco");
  });

  it("recorre partes anidadas (multipart/alternative) hasta encontrar text/plain", () => {
    const parte = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<b>HTML</b>") } },
        {
          mimeType: "multipart/related",
          parts: [{ mimeType: "text/plain", body: { data: b64("Texto plano") } }],
        },
      ],
    };
    expect(extraerCuerpo(parte)).toBe("Texto plano");
  });

  it("cae a HTML sin etiquetas si no hay texto plano", () => {
    const parte = { mimeType: "text/html", body: { data: b64("<p>Monto: <b>RD$ 500</b></p>") } };
    const cuerpo = extraerCuerpo(parte);
    expect(cuerpo).toContain("Monto:");
    expect(cuerpo).toContain("RD$ 500");
    expect(cuerpo).not.toContain("<b>");
  });
});