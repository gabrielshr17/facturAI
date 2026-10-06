import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ExcelJS from "exceljs";
import { cargarConfig } from "../src/config.js";
import { iniciarModuloFiscal } from "../src/fiscal/iniciar.js";
import { firmarXml } from "../src/fiscal/firma.js";
import { certificadoEfimero } from "../src/fiscal/certificacion/certificado-efimero.js";
import {
  procesarFilaSetPruebas,
  type DgiiSetPruebas,
  type ResultadoFilaSetPruebas,
} from "../src/fiscal/certificacion/set-pruebas.js";
import type { FilaSetPruebas } from "../src/fiscal/certificacion/generador.js";
import { leerArgumentosSetPruebas } from "../src/fiscal/certificacion/argumentos.js";

const USO = `Uso:
  pnpm --filter @sfr/api set-pruebas <archivo.xlsx> [--salida <carpeta>] [--enviar]

Sin --enviar es un simulacro: genera, firma y valida cada fila contra el XSD y guarda los XML en la
carpeta de salida (por defecto ./set-pruebas-salida), sin enviar nada. Con --enviar remite cada fila
válida a la DGII en el ambiente de DGII_AMBIENTE (requiere el certificado real configurado).`;

function dosDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function textoCelda(valor: ExcelJS.CellValue): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) {
    return `${dosDigitos(valor.getUTCDate())}-${dosDigitos(valor.getUTCMonth() + 1)}-${valor.getUTCFullYear()}`;
  }
  if (typeof valor === "object") {
    if ("richText" in valor) return valor.richText.map((t) => t.text).join("");
    if ("result" in valor) return textoCelda(valor.result as ExcelJS.CellValue);
    if ("text" in valor) return String(valor.text);
    return "";
  }
  return String(valor);
}

async function leerFilas(archivo: string): Promise<{ hoja: string; numero: number; fila: FilaSetPruebas }[]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(archivo);
  const filas: { hoja: string; numero: number; fila: FilaSetPruebas }[] = [];
  libro.eachSheet((hoja) => {
    const encabezados: string[] = [];
    hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, columna) => {
      encabezados[columna] = textoCelda(celda.value).trim();
    });
    hoja.eachRow((fila, numero) => {
      if (numero === 1) return;
      const datos: FilaSetPruebas = {};
      fila.eachCell({ includeEmpty: false }, (celda, columna) => {
        const encabezado = encabezados[columna];
        if (encabezado) datos[encabezado] = textoCelda(celda.value);
      });
      if (Object.keys(datos).length > 0) filas.push({ hoja: hoja.name, numero, fila: datos });
    });
  });
  return filas;
}

async function main(): Promise<void> {
  const argumentos = leerArgumentosSetPruebas(process.argv.slice(2));
  const { archivo, enviar } = argumentos;
  const salida = resolve(argumentos.salida);
  if (!archivo) {
    console.log(USO);
    process.exitCode = 1;
    return;
  }

  const config = cargarConfig();
  const modulo = iniciarModuloFiscal(config);
  if (enviar && !modulo.disponible) throw new Error(`No se puede enviar: ${modulo.motivo}`);

  const firmar = modulo.disponible
    ? modulo.firmar
    : (() => {
        const cert = certificadoEfimero(config.dgiiRncEmisor ?? "000000000");
        console.warn(`Simulacro con certificado autofirmado (${modulo.motivo}).`);
        return (xml: string) => firmarXml(xml, cert);
      })();
  const sinDgii: DgiiSetPruebas = {
    enviarEcf: () => Promise.reject(new Error("simulacro")),
    consultarResultado: () => Promise.reject(new Error("simulacro")),
    enviarRfce: () => Promise.reject(new Error("simulacro")),
    enviarAprobacionComercial: () => Promise.reject(new Error("simulacro")),
  };
  const dgii = modulo.disponible ? modulo.dgii : sinDgii;

  mkdirSync(salida, { recursive: true });
  const resultados: (ResultadoFilaSetPruebas & { hoja: string })[] = [];
  for (const { hoja, numero, fila } of await leerFilas(archivo)) {
    const r = await procesarFilaSetPruebas(fila, numero, { firmar, dgii, enviar });
    resultados.push({ ...r, hoja });
    if (r.nombreArchivo && r.xmlFirmado) writeFileSync(join(salida, r.nombreArchivo), r.xmlFirmado, "utf8");
    const estado = r.error
      ? `ERROR: ${r.error}`
      : r.erroresXsd.length
        ? `XSD: ${r.erroresXsd.length} error(es)`
        : (r.envio?.estado ?? "válido (no enviado)");
    const avisos = r.columnasSinUsar.length ? ` | columnas sin usar: ${r.columnasSinUsar.join(", ")}` : "";
    console.log(`[${hoja} fila ${numero}] ${r.esquema ?? "?"} ${r.encf ?? ""} → ${estado}${avisos}`);
  }

  writeFileSync(
    join(salida, "reporte.json"),
    JSON.stringify(
      resultados.map(({ xmlFirmado: _xml, ...resto }) => resto),
      null,
      2,
    ),
    "utf8",
  );
  const conProblemas = resultados.filter((r) => r.error || r.erroresXsd.length).length;
  console.log(
    `\n${resultados.length} fila(s), ${conProblemas} con problemas. Detalle en ${join(salida, "reporte.json")}`,
  );
  if (conProblemas > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
