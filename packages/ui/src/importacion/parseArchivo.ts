import ExcelJS from "exceljs";

/** Datos crudos leídos de un archivo de productos (Excel o CSV), antes de mapear columnas. */
export interface ArchivoParseado {
  columnas: string[];
  filas: Record<string, string | number | null>[];
}

/**
 * Lee un .xlsx (vía ExcelJS) o .csv (parser propio, sin dependencia extra) y
 * devuelve filas como objetos usando la primera fila como encabezados.
 *
 * Nota: `xlsx` (SheetJS) NO se usa a propósito — la versión publicada en npm
 * está congelada en 0.18.5 con vulnerabilidades conocidas sin parchear (el
 * proyecto solo distribuye versiones nuevas por su propio CDN, no por npm).
 */
export async function parseArchivoProductos(file: File): Promise<ArchivoParseado> {
  const nombre = file.name.toLowerCase();
  if (nombre.endsWith(".csv")) {
    return parseCsv(await file.text());
  }
  if (nombre.endsWith(".xlsx")) {
    return parseXlsx(await file.arrayBuffer());
  }
  throw new Error("Formato no soportado. Usa un archivo .xlsx o .csv.");
}

function celdaATexto(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // rich text
    if ("result" in v) return celdaATexto(v.result as ExcelJS.CellValue); // fórmula
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    return null;
  }
  return v;
}

async function parseXlsx(buffer: ArrayBuffer): Promise<ArchivoParseado> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const hoja = wb.worksheets[0];
  if (!hoja) return { columnas: [], filas: [] };

  let columnas: string[] = [];
  const filas: ArchivoParseado["filas"] = [];

  hoja.eachRow((row, numeroFila) => {
    const valores = (row.values as ExcelJS.CellValue[]).slice(1).map(celdaATexto);
    if (numeroFila === 1) {
      columnas = valores.map((v, i) => (v != null && String(v).trim() ? String(v).trim() : `Columna ${i + 1}`));
      return;
    }
    if (valores.every((v) => v == null || v === "")) return;
    const fila: ArchivoParseado["filas"][number] = {};
    columnas.forEach((col, i) => {
      fila[col] = valores[i] ?? null;
    });
    filas.push(fila);
  });

  return { columnas, filas };
}

function detectarDelimitador(primeraLinea: string): string {
  const comas = (primeraLinea.match(/,/g) ?? []).length;
  const puntoYComa = (primeraLinea.match(/;/g) ?? []).length;
  return puntoYComa > comas ? ";" : ",";
}

/** Parser CSV minimo (RFC4180): respeta comillas, comas/saltos de línea dentro de campos. */
function partirCsv(texto: string, delimitador: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  let i = 0;
  const n = texto.length;

  while (i < n) {
    const ch = texto[i];
    if (enComillas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 2;
          continue;
        }
        enComillas = false;
        i++;
        continue;
      }
      campo += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      enComillas = true;
      i++;
      continue;
    }
    if (ch === delimitador) {
      fila.push(campo);
      campo = "";
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
      i++;
      continue;
    }
    campo += ch;
    i++;
  }
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/** Convierte un texto de celda a número si parece uno (permite "RD$", separador de miles, coma decimal). */
function tiparCelda(texto: string): string | number | null {
  const t = texto.trim();
  if (t === "") return null;
  const limpio = t.replace(/^RD\$?\s?/i, "").replace(/[$\s]/g, "");
  // Un entero con cero(s) a la izquierda (ej. "0123456789012") casi siempre es un código de barra,
  // no un número real — nadie escribe "0500" para la cantidad 500, pero un EAN/UPC sí empieza en 0
  // seguido. Convertirlo con `Number()` se come ese cero para siempre (`Number("0123") === 123`),
  // así que un código así importado deja de coincidir con el mismo código al escanearlo después.
  if (/^-?0\d/.test(limpio)) return t;
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(limpio)) return Number(limpio.replace(/,/g, ""));
  if (/^-?\d+(,\d+)?$/.test(limpio)) return Number(limpio.replace(",", "."));
  return t;
}

function parseCsv(texto: string): ArchivoParseado {
  const sinBom = texto.replace(/^\uFEFF/, "");
  const primeraLinea = sinBom.split(/\r?\n/, 1)[0] ?? "";
  const delimitador = detectarDelimitador(primeraLinea);
  const filasCeldas = partirCsv(sinBom, delimitador);
  if (filasCeldas.length === 0) return { columnas: [], filas: [] };

  const columnas = filasCeldas[0].map((c, i) => (c.trim() ? c.trim() : `Columna ${i + 1}`));
  const filas: ArchivoParseado["filas"] = [];
  for (let i = 1; i < filasCeldas.length; i++) {
    const celdas = filasCeldas[i];
    if (celdas.every((c) => c.trim() === "")) continue;
    const fila: ArchivoParseado["filas"][number] = {};
    columnas.forEach((col, j) => {
      fila[col] = tiparCelda(celdas[j] ?? "");
    });
    filas.push(fila);
  }
  return { columnas, filas };
}
