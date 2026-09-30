import qrcode from "qrcode-generator";

export function modulosQr(texto: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(texto, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, fila) => Array.from({ length: n }, (_, col) => qr.isDark(fila, col)));
}

export function svgQr(texto: string, tamanoMm: number): string {
  const modulos = modulosQr(texto);
  const n = modulos.length;
  const cuadros = modulos.flatMap((fila, y) => fila.map((oscuro, x) => (oscuro ? `M${x} ${y}h1v1h-1z` : ""))).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" ` +
    `width="${tamanoMm}mm" height="${tamanoMm}mm" shape-rendering="crispEdges">` +
    `<rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${cuadros}" fill="#000"/></svg>`
  );
}
