// Genera todos los PNG/ICO de la marca a partir de los SVG maestros de esta
// carpeta. Se corre a mano cuando la marca cambia — no en el build:
//
//   node brand/generar-iconos.mjs
//
// Rasteriza con Edge/Chrome en modo headless (que ya está en cualquier Windows)
// en vez de sumar una dependencia de imagen al monorepo: `sharp` arrastra
// binarios nativos por plataforma y sólo haría falta para esto. Si no encuentra
// ningún navegador, avisa y no toca nada.
//
// Cada PNG se DECODIFICA y se cuentan sus píxeles antes de darlo por bueno. No
// es paranoia: el navegador headless devuelve exit 0 y un PNG del tamaño
// correcto aunque haya capturado la página a medio pintar, así que sin este
// paso se cuelan iconos vacíos o a medias — pasó en la primera generación con
// 107, 128, 142, 150 (en blanco) y 256 (pintado a la mitad).

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, copyFileSync, existsSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, "..");
const ICONOS_TAURI = join(RAIZ, "packages/desktop/src-tauri/icons");
const PUBLICO_WEB = join(RAIZ, "packages/web/public");

const NAVEGADORES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

function buscarNavegador() {
  const delEntorno = process.env.CHROME_PATH;
  if (delEntorno && existsSync(delEntorno)) return delEntorno;
  const encontrado = NAVEGADORES.find((p) => existsSync(p));
  if (!encontrado) {
    console.error(
      "No se encontró Edge ni Chrome. Instalá uno, o apuntá CHROME_PATH al ejecutable:\n" +
        '  CHROME_PATH="/ruta/al/navegador" node brand/generar-iconos.mjs',
    );
    process.exit(1);
  }
  return encontrado;
}

const NAVEGADOR = buscarNavegador();
const TEMP = mkdtempSync(join(tmpdir(), "sfr-iconos-"));

// --- Rasterizado -------------------------------------------------------------

/** Copia del SVG con `width`/`height` explícitos en el tamaño pedido. Dejar que
 *  el SVG se estire al 100 % de la ventana parecía más simple, pero da capturas
 *  vacías o a medio pintar según el tamaño; con tamaño intrínseco el layout
 *  queda resuelto de entrada y el render es estable. */
function fuenteEnTamano(nombreSvg, lado) {
  const original = readFileSync(join(AQUI, nombreSvg), "utf8");
  const ajustado = original.replace(/width="512"\s+height="512"/, `width="${lado}" height="${lado}"`);
  const destino = join(TEMP, `${lado}-${nombreSvg}`);
  writeFileSync(destino, ajustado);
  return destino;
}

function capturar(rutaSvg, lado, rutaSalida) {
  execFileSync(
    NAVEGADOR,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      // Sin esto el fondo sale blanco y las esquinas redondeadas de la ficha
      // dejan de ser transparentes.
      "--default-background-color=00000000",
      "--no-first-run",
      "--no-default-browser-check",
      "--force-device-scale-factor=1",
      "--virtual-time-budget=4000",
      `--window-size=${lado},${lado}`,
      `--screenshot=${rutaSalida}`,
      pathToFileURL(rutaSvg).href,
    ],
    { stdio: "pipe", timeout: 60000 },
  );
}

// --- Verificación ------------------------------------------------------------

/** Decodifica un PNG RGBA de 8 bits sin entrelazar (lo que produce el
 *  navegador) y devuelve qué proporción de la imagen tiene tinta, y cuánta de
 *  esa tinta es blanca — o sea, la marca calada. */
function medirPng(buffer) {
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buffer.length) {
    const largo = buffer.readUInt32BE(pos);
    const tipo = buffer.slice(pos + 4, pos + 8).toString("ascii");
    if (tipo === "IHDR") {
      ihdr = {
        w: buffer.readUInt32BE(pos + 8),
        h: buffer.readUInt32BE(pos + 12),
        prof: buffer.readUInt8(pos + 16),
        color: buffer.readUInt8(pos + 17),
        entrelazado: buffer.readUInt8(pos + 20),
      };
    } else if (tipo === "IDAT") {
      idat.push(buffer.slice(pos + 8, pos + 8 + largo));
    } else if (tipo === "IEND") break;
    pos += 12 + largo;
  }
  if (!ihdr) throw new Error("PNG sin IHDR");
  // Color 6 = RGBA, color 2 = RGB. El navegador escribe RGB cuando la imagen no
  // tiene ni un pixel transparente — le pasa a la variante `maskable`, que es un
  // cuadrado a sangre. Sin contemplar ese caso, el verificador reventaba
  // justamente sobre el único icono que siempre está bien.
  if (ihdr.prof !== 8 || (ihdr.color !== 6 && ihdr.color !== 2) || ihdr.entrelazado !== 0) {
    throw new Error(`PNG inesperado (profundidad ${ihdr.prof}, color ${ihdr.color})`);
  }
  const conAlfa = ihdr.color === 6;

  const bpp = conAlfa ? 4 : 3;
  const bytesPorLinea = ihdr.w * bpp;
  const crudo = inflateSync(Buffer.concat(idat));
  let anterior = Buffer.alloc(bytesPorLinea);
  let conTinta = 0;
  let blancos = 0;

  for (let y = 0; y < ihdr.h; y++) {
    const inicio = y * (bytesPorLinea + 1);
    const filtro = crudo[inicio];
    const linea = crudo.slice(inicio + 1, inicio + 1 + bytesPorLinea);
    const actual = Buffer.alloc(bytesPorLinea);
    for (let x = 0; x < bytesPorLinea; x++) {
      const izq = x >= bpp ? actual[x - bpp] : 0;
      const arriba = anterior[x];
      const diagonal = x >= bpp ? anterior[x - bpp] : 0;
      let v = linea[x];
      if (filtro === 1) v += izq;
      else if (filtro === 2) v += arriba;
      else if (filtro === 3) v += (izq + arriba) >> 1;
      else if (filtro === 4) {
        const p = izq + arriba - diagonal;
        const pa = Math.abs(p - izq);
        const pb = Math.abs(p - arriba);
        const pc = Math.abs(p - diagonal);
        v += pa <= pb && pa <= pc ? izq : pb <= pc ? arriba : diagonal;
      }
      actual[x] = v & 0xff;
    }
    for (let x = 0; x < ihdr.w; x++) {
      const o = x * bpp;
      if (!conAlfa || actual[o + 3] > 16) {
        conTinta++;
        if (actual[o] > 200 && actual[o + 1] > 200 && actual[o + 2] > 200) blancos++;
      }
    }
    anterior = actual;
  }

  const total = ihdr.w * ihdr.h;
  return { w: ihdr.w, h: ihdr.h, tinta: conTinta / total, marca: blancos / total };
}

/** La ficha es un cuadrado redondeado a sangre: las esquinas se llevan ~3 %, así
 *  que por debajo de 90 % de tinta está a medio pintar. Y la marca calada ocupa
 *  ~15 % en blanco; si no hay blanco, se pintó el fondo pero no la marca. */
const TINTA_MINIMA = 0.9;
const MARCA_MINIMA = 0.05;

function rasterizar(nombreSvg, lado, rutaSalida) {
  const fuente = fuenteEnTamano(nombreSvg, lado);
  let ultimo = "";
  for (let intento = 1; intento <= 3; intento++) {
    capturar(fuente, lado, rutaSalida);
    const png = readFileSync(rutaSalida);
    const m = medirPng(png);
    if (m.w !== lado || m.h !== lado) ultimo = `salió ${m.w}x${m.h}`;
    else if (m.tinta < TINTA_MINIMA) ultimo = `sólo ${(m.tinta * 100).toFixed(1)} % con tinta — a medio pintar`;
    else if (m.marca < MARCA_MINIMA) ultimo = `sin la marca calada (${(m.marca * 100).toFixed(1)} % blanco)`;
    else return { png, medida: m };
  }
  throw new Error(`${rutaSalida} (${lado}px): ${ultimo}`);
}

// --- Empaquetado ICO ---------------------------------------------------------

/** Windows Vista+ acepta entradas PNG dentro del contenedor .ico, así que no
 *  hace falta convertir a BMP. */
function empacarIco(entradas, rutaSalida) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(entradas.length, 4);

  let desplazamiento = 6 + entradas.length * 16;
  const directorio = entradas.map(({ lado, datos }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(lado >= 256 ? 0 : lado, 0); // 0 significa 256
    e.writeUInt8(lado >= 256 ? 0 : lado, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(datos.length, 8);
    e.writeUInt32LE(desplazamiento, 12);
    desplazamiento += datos.length;
    return e;
  });

  writeFileSync(rutaSalida, Buffer.concat([cabecera, ...directorio, ...entradas.map((e) => e.datos)]));
}

// --- Salidas -----------------------------------------------------------------

/** Íconos de escritorio (Tauri). Los `Square*Logo` sólo los usa el empaquetado
 *  MSIX/Appx, pero se regeneran igual para no dejar la mitad del juego con el
 *  logo de la plantilla de Tauri. */
const ESCRITORIO = [
  ["32x32.png", 32],
  ["64x64.png", 64],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
  ["StoreLogo.png", 50],
  ["Square30x30Logo.png", 30],
  ["Square44x44Logo.png", 44],
  ["Square71x71Logo.png", 71],
  ["Square89x89Logo.png", 89],
  ["Square107x107Logo.png", 107],
  ["Square142x142Logo.png", 142],
  ["Square150x150Logo.png", 150],
  ["Square284x284Logo.png", 284],
  ["Square310x310Logo.png", 310],
];

/** Tamaños dentro del .ico: 16 y 32 los usa el Explorador y la barra de tareas,
 *  256 el instalador NSIS y la vista de iconos grandes. */
const TAMANOS_ICO = [16, 24, 32, 48, 64, 128, 256];

const WEB = [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  // iOS ignora el manifest y no acepta SVG en `apple-touch-icon`: sin este PNG,
  // "Agregar a inicio" en iPhone se inventa una miniatura de la página.
  ["apple-touch-icon.png", 180],
];

try {
  console.log(`Rasterizando con ${NAVEGADOR}\n`);
  const informe = (etiqueta, lado, m) =>
    console.log(
      `  ${etiqueta.padEnd(30)} ${String(lado).padStart(3)}px  tinta ${(m.tinta * 100).toFixed(0)} %  marca ${(m.marca * 100).toFixed(0)} %`,
    );

  for (const [nombre, lado] of ESCRITORIO) {
    const { medida } = rasterizar("marca-ficha.svg", lado, join(ICONOS_TAURI, nombre));
    informe(`escritorio/${nombre}`, lado, medida);
  }

  const paraIco = TAMANOS_ICO.map((lado) => ({
    lado,
    datos: rasterizar("marca-ficha.svg", lado, join(TEMP, `ico-${lado}.png`)).png,
  }));
  empacarIco(paraIco, join(ICONOS_TAURI, "icon.ico"));
  console.log(`  ${"escritorio/icon.ico".padEnd(30)}       ${TAMANOS_ICO.join(", ")}`);

  for (const [nombre, lado] of WEB) {
    const { medida } = rasterizar("marca-ficha.svg", lado, join(PUBLICO_WEB, nombre));
    informe(`web/${nombre}`, lado, medida);
  }
  const maskable = rasterizar("marca-ficha-maskable.svg", 512, join(PUBLICO_WEB, "icon-maskable-512.png"));
  informe("web/icon-maskable-512.png", 512, maskable.medida);

  copyFileSync(join(AQUI, "marca-ficha.svg"), join(PUBLICO_WEB, "icon.svg"));
  console.log(`  ${"web/icon.svg".padEnd(30)}`);

  console.log("\nListo — todos verificados píxel a píxel.");
} finally {
  rmSync(TEMP, { recursive: true, force: true });
}
