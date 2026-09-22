/**
 * Textos de error que le llegan al usuario tal cual, en pantalla.
 *
 * Viven acá y no sueltos en cada repo porque son parte de la interfaz: dicen qué
 * pasó y qué hacer, sin ids internos ni jerga del motor de base de datos
 * ("UNIQUE constraint failed", "FOREIGN KEY", "Producto 01J8… no existe").
 * Si el mensaje necesita el id para depurar, va al `console.error`, no a la
 * pantalla (ver `mensajeError` en la UI).
 */
export const MSG = {
  productoNoExiste:
    "Ese producto ya no existe. Es posible que se haya eliminado desde otra ventana; actualiza la lista.",
  clienteNoExiste: "Ese cliente ya no existe. Es posible que se haya eliminado desde otra ventana; actualiza la lista.",
  proveedorNoExiste:
    "Ese suplidor ya no existe. Es posible que se haya eliminado desde otra ventana; actualiza la lista.",
  ticketNoExiste: "Ese ticket ya no está abierto. Es posible que ya se cobrara o se cancelara desde otra ventana.",
  facturaNoExiste: "Esa factura ya no existe. Es posible que se haya eliminado desde otra ventana; actualiza la lista.",
  lineaNoExiste: "Ese renglón del ticket ya no existe. Es posible que se quitara desde otra ventana.",
  comprobanteNoExiste:
    "No se encontró el comprobante fiscal de esa factura, así que no se puede emitir la nota de crédito.",
  secuenciaNoExiste: "Esa secuencia de NCF ya no existe. Revísala en Configuración → Comprobantes fiscales.",
} as const;
