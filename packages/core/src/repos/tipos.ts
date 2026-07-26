import type { ImpuestoTipo } from "../dominio/impuesto.js";
import type { MetodoPago } from "../dominio/factura.js";
import type { TipoEcf } from "../dominio/ecf.js";
import type { PoliticaSinExistencia } from "../dominio/inventario.js";
import type { TipoPromocion, AplicaAPromocion } from "../dominio/promocion.js";

/** Campos de auditoría comunes a todas las entidades sincronizables. */
export interface Auditoria {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type TipoVenta = "unidad" | "granel" | "paquete" | "kit";

export interface Producto extends Auditoria {
  id: string;
  codigo_barra: string | null;
  descripcion: string;
  tipo_venta: TipoVenta;
  unidad_medida: string | null;
  costo: number;
  pct_ganancia: number;
  precio_venta: number;
  precio_mayoreo: number | null;
  departamento_id: string | null;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  existencia: number | null;
  politica_sin_existencia: PoliticaSinExistencia;
  activo: number; // 0 | 1
}

export interface Cliente extends Auditoria {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  comentarios: string | null;
  aplica_credito: number; // 0 | 1
  limite_credito: number;
  saldo_credito: number;
  documento_tipo: "rnc" | "cedula" | null;
  documento_numero: string | null;
}

export interface Departamento extends Auditoria {
  id: string;
  nombre: string;
  activo: number; // 0 | 1
}

export type EstadoFactura = "abierta" | "cobrada" | "anulada";
export type TipoFactura = "normal" | "fiscal";

export interface Factura extends Auditoria {
  id: string;
  numero_interno: number;
  fecha_hora: string;
  cliente_id: string | null;
  caja_id: string | null;
  usuario_id: string | null;
  tipo: TipoFactura;
  subtotal_gravado: number;
  subtotal_exento: number;
  total_itbis: number;
  total: number;
  monto_pagado: number;
  cambio: number;
  notas: string | null;
  estado: EstadoFactura;
  comprobante_id: string | null;
}

export interface FacturaLinea extends Auditoria {
  id: string;
  factura_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  es_mayoreo: number; // 0 | 1
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  monto_itbis: number;
  subtotal: number;
}

export interface Pago extends Auditoria {
  id: string;
  factura_id: string;
  metodo: MetodoPago;
  monto: number;
  referencia: string | null;
}

export interface Devolucion extends Auditoria {
  id: string;
  factura_id: string;
  fecha: string;
  motivo: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  comprobante_id: string | null; // Nota de Crédito (E34), NULL si la venta no fue fiscal
}

export interface DevolucionLinea extends Auditoria {
  id: string;
  devolucion_id: string;
  factura_linea_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  monto_itbis: number;
  subtotal: number;
}

export type ModoSecuencia = "ecf" | "ncf_papel" | "contingencia";
export type EstadoSecuencia = "disponible" | "agotada" | "vencida";
export type EstadoDgii = "pendiente" | "aceptado" | "rechazado" | "contingencia";

export interface SecuenciaNcf extends Auditoria {
  id: string;
  tipo_ecf: TipoEcf;
  prefijo: string;
  modo: ModoSecuencia;
  rango_desde: number;
  rango_hasta: number;
  proximo_numero: number;
  vencimiento: string; // fecha ISO (date)
  estado: EstadoSecuencia;
}

export interface ComprobanteFiscal extends Auditoria {
  id: string;
  factura_id: string;
  tipo_ecf: TipoEcf;
  ncf: string;
  secuencia_id: string;
  rnc_emisor: string | null;
  receptor_documento_tipo: "rnc" | "cedula" | null;
  receptor_documento_numero: string | null;
  fecha_emision: string;
  monto_gravado: number;
  monto_exento: number;
  monto_itbis: number;
  total: number;
  estado_dgii: EstadoDgii;
  track_id_dgii: string | null;
  codigo_seguridad: string | null;
  xml_firmado_ruta: string | null;
  qr_url: string | null;
  fecha_transmision: string | null;
}

export type EstadoCorteCaja = "abierto" | "cerrado";

export interface CorteCaja extends Auditoria {
  id: string;
  caja_id: string | null;
  usuario_id: string | null;
  fecha_apertura: string;
  fecha_cierre: string;
  monto_inicial: number;
  total_ventas: number;
  total_itbis: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_transferencia: number;
  total_credito: number;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
  estado: EstadoCorteCaja;
}

export type TipoMovimientoInventario = "entrada" | "salida" | "ajuste" | "venta" | "compra";

export interface MovimientoInventario extends Auditoria {
  id: string;
  producto_id: string;
  tipo: TipoMovimientoInventario;
  /** Delta con signo aplicado a la existencia (positivo = entra, negativo = sale). */
  cantidad: number;
  costo: number | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  fecha: string;
  usuario_id: string | null;
}

export interface Proveedor extends Auditoria {
  id: string;
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
}

export type EstadoClasificacionCompra = "con_fiscal" | "sin_fiscal" | "pendiente_revision";
export type OrigenCompra = "manual" | "chatbot";

export interface Compra extends Auditoria {
  id: string;
  fecha: string;
  proveedor_id: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  ncf_proveedor: string | null;
  tiene_comprobante_fiscal: number; // 0 | 1
  mes_ano_contable: string; // 'AAAA-MM'
  estado_clasificacion: EstadoClasificacionCompra;
  origen: OrigenCompra;
  notas: string | null;
}

export interface CompraLinea extends Auditoria {
  id: string;
  compra_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  monto_itbis: number;
  subtotal: number;
}

export type EstadoRevisionComprobante = "auto" | "confirmado_usuario" | "pendiente";
export type IdentificadoPor = "chatbot" | "usuario";

export interface ComprobanteArchivo extends Auditoria {
  id: string;
  compra_id: string | null;
  nombre_archivo: string;
  tipo_mime: string;
  contenido_base64: string;
  mes_ano: string; // 'AAAA-MM'
  tiene_fiscal: number; // 0 | 1
  estado_revision: EstadoRevisionComprobante;
  identificado_por: IdentificadoPor;
  datos_extraidos_json: string | null;
}

export type OrigenAccion = "app" | "chatbot";

/** Registro append-only de "quién y cuándo" (§ Caja y auditoría). No es una entidad sincronizable editable. */
export interface BitacoraAccion {
  id: string;
  usuario_id: string | null;
  origen: OrigenAccion;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  resumen: string | null;
  confirmada: number; // 0 | 1
  timestamp: string;
}

export interface Promocion extends Auditoria {
  id: string;
  nombre: string;
  tipo: TipoPromocion;
  valor: number;
  aplica_a: AplicaAPromocion;
  producto_id: string | null;
  departamento_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  activa: number; // 0 | 1
}

export interface Negocio extends Auditoria {
  id: string;
  nombre_comercial: string;
  razon_social: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  logo_ruta: string | null;
  regimen: string | null;
  ancho_impresora_default: number; // 58 | 80
  redondeo_centavo: number; // 0 | 1
  inventario_activo: number; // 0 | 1
}
