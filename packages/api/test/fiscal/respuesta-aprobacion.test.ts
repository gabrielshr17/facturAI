import { describe, expect, it } from "vitest";
import { interpretarRespuestaAprobacion } from "../../src/fiscal/respuesta-aprobacion.js";

describe("interpretarRespuestaAprobacion", () => {
  it("acepta codigo '1' como aprobada y conserva el mensaje", () => {
    const r = interpretarRespuestaAprobacion(JSON.stringify({ mensaje: ["OK"], estado: "Aprobado", codigo: "1" }));
    expect(r).toMatchObject({ estado: "aceptada", aceptada: true, mensajes: ["OK"] });
  });

  it("acepta codigo numérico 1", () => {
    expect(interpretarRespuestaAprobacion('{"codigo":1}')).toMatchObject({ estado: "aceptada", aceptada: true });
  });

  it("codigo '2' es rechazada y trae los mensajes", () => {
    const r = interpretarRespuestaAprobacion(
      JSON.stringify({ mensaje: ["Factura no encontrada para esta Aprobación comercial."], codigo: "2" }),
    );
    expect(r).toMatchObject({
      estado: "rechazada",
      aceptada: false,
      mensajes: ["Factura no encontrada para esta Aprobación comercial."],
    });
  });

  it("tolera mayúsculas en los nombres y un mensaje de texto suelto", () => {
    const r = interpretarRespuestaAprobacion('{"Codigo":"1","Estado":"Aprobado","Mensaje":"Recibida"}');
    expect(r).toMatchObject({ estado: "aceptada", mensajes: ["Recibida"] });
  });

  it("tolera una respuesta envuelta en un arreglo", () => {
    const r = interpretarRespuestaAprobacion('[{"codigo":"1","mensaje":["OK"]}]');
    expect(r).toMatchObject({ estado: "aceptada", mensajes: ["OK"] });
  });

  it("tolera mensajes como lista de objetos con valor", () => {
    const r = interpretarRespuestaAprobacion('{"codigo":"2","mensajes":[{"codigo":"7","valor":"Firma inválida"}]}');
    expect(r).toMatchObject({ estado: "rechazada", mensajes: ["7: Firma inválida"] });
  });

  it("lee la respuesta en formato XML", () => {
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?><RespuestaAprobacionComercial><mensaje>OK</mensaje><estado>Aprobado</estado><codigo>1</codigo></RespuestaAprobacionComercial>';
    expect(interpretarRespuestaAprobacion(xml)).toMatchObject({ estado: "aceptada", mensajes: ["OK"] });
    const rechazo =
      "<RespuestaAprobacionComercial><mensaje>La firma del XML no es válida</mensaje><codigo>2</codigo></RespuestaAprobacionComercial>";
    expect(interpretarRespuestaAprobacion(rechazo)).toMatchObject({
      estado: "rechazada",
      mensajes: ["La firma del XML no es válida"],
    });
  });

  it("sin código, decide por el texto del estado", () => {
    expect(interpretarRespuestaAprobacion('{"estado":"Aprobación comercial aprobada"}').estado).toBe("aceptada");
    expect(interpretarRespuestaAprobacion('{"estado":"Rechazado"}').estado).toBe("rechazada");
  });

  it("una respuesta que no se entiende NO se da por rechazada: se marca no_reconocida y se conserva cruda", () => {
    const r = interpretarRespuestaAprobacion('{"algo":"inesperado"}');
    expect(r.estado).toBe("no_reconocida");
    expect(r.aceptada).toBe(false);
    expect(r.respuestaCruda).toBe('{"algo":"inesperado"}');
    expect(r.mensajes.join(" ")).toContain("inesperado");
  });

  it("HTML, texto o cuerpo vacío también son no_reconocida", () => {
    expect(interpretarRespuestaAprobacion("<html><body>Bad gateway</body></html>").estado).toBe("no_reconocida");
    expect(interpretarRespuestaAprobacion("Error interno").estado).toBe("no_reconocida");
    const vacia = interpretarRespuestaAprobacion("   ");
    expect(vacia.estado).toBe("no_reconocida");
    expect(vacia.respuestaCruda).toBe("");
  });

  it("recorta la respuesta cruda a 4000 caracteres", () => {
    const r = interpretarRespuestaAprobacion(`{"x":"${"a".repeat(6000)}"}`);
    expect(r.respuestaCruda).toHaveLength(4000);
  });
});
