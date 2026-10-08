import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cargarCertificado } from "../src/fiscal/firma.js";
import { firmarArchivoXml, rutaSalidaFirmada } from "../src/fiscal/firmar-archivo.js";

const USO = `Uso:
  pnpm --filter @sfr/api firmar-xml <archivo.xml> --p12 <ruta al .p12> [--salida <archivo firmado.xml>]

Firma el XML con el certificado (XMLDSig, firma envuelta) y lo guarda junto al original con el sufijo
-firmado. No envía nada a ninguna parte. La contraseña se toma de DGII_P12_PASSWORD o, si no está,
se pide en la terminal sin mostrarla.`;

function argumento(nombre: string): string | undefined {
  const indice = process.argv.indexOf(nombre);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

function pedirClaveOculta(): Promise<string> {
  return new Promise((resolver, rechazar) => {
    if (!process.stdin.isTTY) {
      rechazar(
        new Error("No hay terminal interactiva: define DGII_P12_PASSWORD o ejecuta esto en tu propia terminal."),
      );
      return;
    }
    process.stdout.write("Contraseña del .p12: ");
    let clave = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const alRecibir = (tecla: string): void => {
      for (const caracter of tecla) {
        if (caracter === "\r" || caracter === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", alRecibir);
          process.stdout.write("\n");
          resolver(clave);
          return;
        }
        if (caracter === "\u0003") {
          process.stdin.setRawMode(false);
          rechazar(new Error("Cancelado."));
          return;
        }
        if (caracter === "\u007f" || caracter === "\b") clave = clave.slice(0, -1);
        else clave += caracter;
      }
    };
    process.stdin.on("data", alRecibir);
  });
}

async function principal(): Promise<number> {
  const entrada = process.argv[2];
  const rutaP12 = argumento("--p12") ?? process.env.DGII_P12_PATH;
  if (!entrada || entrada.startsWith("--") || !rutaP12) {
    console.error(USO);
    return 1;
  }
  const rutaEntrada = resolve(entrada);
  const rutaSalida = resolve(argumento("--salida") ?? rutaSalidaFirmada(rutaEntrada));
  if (!existsSync(rutaEntrada)) {
    console.error(`No existe el archivo: ${rutaEntrada}`);
    return 1;
  }
  if (existsSync(rutaSalida)) {
    console.error(`Ya existe ${rutaSalida}. Bórralo o indica otra ruta con --salida.`);
    return 1;
  }
  if (!existsSync(resolve(rutaP12))) {
    console.error(`No existe el certificado: ${resolve(rutaP12)}`);
    return 1;
  }

  try {
    const clave = process.env.DGII_P12_PASSWORD || (await pedirClaveOculta());
    const certificado = cargarCertificado(readFileSync(resolve(rutaP12)), clave);
    if (certificado.venceEl.getTime() < Date.now()) {
      console.error(`El certificado venció el ${certificado.venceEl.toISOString()}.`);
      return 1;
    }
    const firmado = firmarArchivoXml(readFileSync(rutaEntrada, "utf8"), certificado);
    writeFileSync(rutaSalida, firmado, "utf8");
    console.log(`Firmado: ${rutaSalida}`);
    console.log(`Certificado vigente hasta ${certificado.venceEl.toISOString().slice(0, 10)}. No se envió nada.`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

process.exitCode = await principal();
