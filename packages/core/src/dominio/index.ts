export { redondear2, ajustarCentavo, calcularCambio, sumar } from "./dinero.js";
export { type ImpuestoTipo, TASA_POR_TIPO, tasaDe } from "./impuesto.js";
export { MSG } from "./mensajes.js";
export {
  type CalculoPrecioInput,
  PCT_GANANCIA_POR_DEFECTO,
  precioDesdeCosto,
  calcularPrecioVenta,
  pctGananciaDesdePrecio,
} from "./precio.js";
export {
  type LineaInput,
  type LineaCalculada,
  type TotalesFactura,
  type MetodoPago,
  type PagoInput,
  type ResultadoCobro,
  calcularLinea,
  calcularTotales,
  procesarCobro,
} from "./factura.js";
export {
  type TipoEcf,
  formatearNcf,
  tipoEcfSugerido,
  ETIQUETA_TIPO_ECF,
} from "./ecf.js";
export {
  type CorteCajaInput,
  type CorteCajaResultado,
  calcularCorteCaja,
} from "./caja.js";
export {
  type PoliticaSinExistencia,
  type DisponibilidadInput,
  type DisponibilidadResultado,
  evaluarDisponibilidad,
} from "./inventario.js";
export {
  type TipoPromocion,
  type AplicaAPromocion,
  type DescuentoInput,
  aplicarDescuento,
} from "./promocion.js";
