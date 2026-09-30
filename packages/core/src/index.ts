export type { SqlDriver } from "./db/driver.js";
export { migrations, type Migration } from "./db/migrations.js";
export { migrate } from "./db/migrator.js";
export { seed } from "./db/seed.js";
// Nota: `createNodeSqliteDriver` NO se exporta aquí a propósito. Usa `node:sqlite`
// y solo sirve en Node (tests/scripts), que lo importan por ruta directa. Sacarlo
// del barrel evita que el bundle del navegador arrastre `require("node:sqlite")`.
export { newId, now } from "./ids.js";
export * from "./dominio/index.js";
export {
  esCorreoValido,
  esRncValido,
  esCedulaValida,
  esDocumentoValido,
  tieneValor,
  normalizar,
  type ErrorValidacion,
} from "./dominio/validacion.js";
export * from "./repos/index.js";
export {
  type ProveedorFiscal,
  type ComprobanteATransmitir,
  type ResultadoTransmision,
  type EstadoTransmision,
  type EmisorFiscal,
  type LineaATransmitir,
  type PagoATransmitir,
  type ReferenciaComprobante,
  type CodigoModificacion,
  crearProveedorFiscalSimulado,
  tieneValidezFiscal,
} from "./fiscal/proveedor.js";
export {
  cobrarConFiscal,
  type CobrarConFiscalInput,
  type CobrarConFiscalDeps,
  type ResultadoCobroFiscal,
} from "./fiscal/cobro-fiscal.js";
export {
  reconciliarComprobantesPendientes,
  anularNcfPendientes,
  agruparEnRangos,
  entregarComprobantesAReceptores,
  type DatosEntrega,
  type ResultadoEntrega,
  type EntregaDeps,
  type ReconciliarDeps,
  type ResumenReconciliacion,
  type AnularDeps,
  type RangoNcf,
} from "./fiscal/seguimiento.js";
export { validarEmisor, emisorDesdeNegocio, UMBRAL_CONSUMO_CON_COMPRADOR } from "./fiscal/transmision.js";
export {
  registrarDevolucionConFiscal,
  type DevolucionConFiscalDeps,
  type ResultadoDevolucionFiscal,
} from "./fiscal/devolucion-fiscal.js";
export {
  emitirNotaDebitoFiscal,
  TASAS_NOTA_DEBITO,
  type NotaDebitoInput,
  type NotaDebitoFiscalDeps,
  type ResultadoNotaDebitoFiscal,
} from "./fiscal/nota-debito-fiscal.js";
export {
  emitirComprobanteDeCompra,
  type TipoEcfDeCompra,
  type RetencionLineaInput,
  type ComprobanteDeCompraInput,
  type ComprobanteDeCompraDeps,
  type ResultadoComprobanteDeCompra,
} from "./fiscal/comprobante-compra.js";
export {
  crearClienteAuth,
  iniciarSesionGoogleWeb,
  iniciarSesionGoogleDesktop,
  completarInicioSesionDesktop,
  obtenerSesion,
  cerrarSesion,
  alCambiarSesion,
  type SesionAuth,
} from "./auth/supabase.js";
