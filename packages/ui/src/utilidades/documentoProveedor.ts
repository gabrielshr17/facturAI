export function documentoProveedor(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  return digitos.length === 9 || digitos.length === 11 ? digitos : null;
}
