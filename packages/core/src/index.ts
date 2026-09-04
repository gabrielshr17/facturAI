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
  crearProveedorFiscalSimulado,
} from "./fiscal/proveedor.js";
export {
  cobrarConFiscal,
  type CobrarConFiscalInput,
  type CobrarConFiscalDeps,
  type ResultadoCobroFiscal,
} from "./fiscal/cobro-fiscal.js";
export {
  registrarDevolucionConFiscal,
  type DevolucionConFiscalDeps,
  type ResultadoDevolucionFiscal,
} from "./fiscal/devolucion-fiscal.js";
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
