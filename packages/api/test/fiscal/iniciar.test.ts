import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cargarConfig } from "../../src/config.js";
import { iniciarModuloFiscal } from "../../src/fiscal/iniciar.js";
import { certificadoPrueba, CLAVE_P12_PRUEBA } from "./certificado-prueba.js";

function configCon(serialSujeto: string | undefined, env: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "p12-"));
  const ruta = join(dir, "empresa.p12");
  writeFileSync(ruta, certificadoPrueba(serialSujeto).p12);
  return cargarConfig({
    DGII_P12_PATH: ruta,
    DGII_P12_PASSWORD: CLAVE_P12_PRUEBA,
    DGII_RNC_EMISOR: "131880738",
    ...env,
  });
}

describe("iniciarModuloFiscal", () => {
  it("queda disponible si el SN del certificado corresponde al RNC configurado", () => {
    const modulo = iniciarModuloFiscal(configCon("RNC131880738"));
    expect(modulo).toMatchObject({ disponible: true, rncEmisor: "131880738" });
  });

  it("no queda disponible si el SN del certificado es de otro RNC", () => {
    const modulo = iniciarModuloFiscal(configCon("RNC101010101"));
    expect(modulo.disponible).toBe(false);
    if (!modulo.disponible) {
      expect(modulo.motivo).toMatch(/SN/);
      expect(modulo.codigo).toBe("sn-no-coincide");
    }
  });

  it("acepta un certificado personal si su cédula coincide con DGII_CEDULA_TITULAR", () => {
    const modulo = iniciarModuloFiscal(configCon("IDCDO-40200403224", { DGII_CEDULA_TITULAR: "402-0040322-4" }));
    expect(modulo).toMatchObject({ disponible: true, rncEmisor: "131880738" });
  });

  it("rechaza un certificado personal si no se configuró la cédula del titular", () => {
    const modulo = iniciarModuloFiscal(configCon("IDCDO-40200403224"));
    expect(modulo.disponible).toBe(false);
    if (!modulo.disponible) expect(modulo.codigo).toBe("sn-no-coincide");
  });

  it("rechaza un certificado personal de otra cédula aunque haya una configurada", () => {
    const modulo = iniciarModuloFiscal(configCon("IDCDO-00100000001", { DGII_CEDULA_TITULAR: "40200403224" }));
    expect(modulo.disponible).toBe(false);
    if (!modulo.disponible) expect(modulo.codigo).toBe("sn-no-coincide");
  });

  it("no queda disponible si el certificado no trae SN", () => {
    const modulo = iniciarModuloFiscal(configCon(undefined));
    expect(modulo.disponible).toBe(false);
  });

  it("exige DGII_RNC_EMISOR", () => {
    const modulo = iniciarModuloFiscal(configCon("RNC131880738", { DGII_RNC_EMISOR: "" }));
    expect(modulo.disponible).toBe(false);
    if (!modulo.disponible) {
      expect(modulo.motivo).toMatch(/DGII_RNC_EMISOR/);
      expect(modulo.codigo).toBe("falta-rnc");
    }
  });

  it("distingue la contraseña incorrecta del certificado", () => {
    const modulo = iniciarModuloFiscal(configCon("RNC131880738", { DGII_P12_PASSWORD: "otra-clave" }));
    expect(modulo.disponible).toBe(false);
    if (!modulo.disponible) expect(modulo.codigo).toBe("certificado-ilegible");
  });

  it("acepta el certificado en base64 (DGII_P12_BASE64) para hostings sin archivos", () => {
    const modulo = iniciarModuloFiscal(
      cargarConfig({
        DGII_P12_BASE64: certificadoPrueba("RNC131880738").p12.toString("base64"),
        DGII_P12_PASSWORD: CLAVE_P12_PRUEBA,
        DGII_RNC_EMISOR: "131880738",
      }),
    );
    expect(modulo).toMatchObject({ disponible: true, rncEmisor: "131880738" });
  });

  it("sin certificado no queda disponible", () => {
    const modulo = iniciarModuloFiscal(cargarConfig({ DGII_RNC_EMISOR: "131880738" }));
    expect(modulo.disponible).toBe(false);
    if (!modulo.disponible) expect(modulo.codigo).toBe("falta-certificado");
  });
});
