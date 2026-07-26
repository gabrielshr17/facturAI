/**
 * Migraciones del esquema.
 *
 * Cada migración tiene un `id` incremental y su SQL. El migrador las aplica en
 * orden y registra las aplicadas en `_migracion`. El SQL usa tipos SQLite
 * (TEXT/REAL/INTEGER); en Postgres (Fase 2) se mapean vía la capa de sync.
 *
 * Convenciones (ver plan.md):
 *  - PK `id TEXT` = UUID generado en el cliente.
 *  - Todas las tablas sincronizables: `created_at`, `updated_at`, `deleted_at`.
 *  - Montos como REAL con redondeo a 2 decimales en la capa de dominio.
 *
 * Fase 0 crea SOLO las tablas del MVP. El resto del modelo (fiscal, compras,
 * inventario, corte, bitácora) se añade en migraciones de Fase 2.
 */
export interface Migration {
  id: number;
  nombre: string;
  sql: string;
}

export const migrations: Migration[] = [
  {
    id: 1,
    nombre: "mvp_inicial",
    sql: /* sql */ `
      -- Configuración / acceso -------------------------------------------------
      CREATE TABLE negocio (
        id                       TEXT PRIMARY KEY,
        nombre_comercial         TEXT NOT NULL,
        razon_social             TEXT,
        rnc                      TEXT,
        direccion                TEXT,
        telefono                 TEXT,
        correo                   TEXT,
        logo_ruta                TEXT,
        regimen                  TEXT,
        ancho_impresora_default  INTEGER NOT NULL DEFAULT 80,  -- 58 | 80
        redondeo_centavo         INTEGER NOT NULL DEFAULT 1,    -- bool
        inventario_activo        INTEGER NOT NULL DEFAULT 0,    -- bool (MVP: off)
        created_at               TEXT NOT NULL,
        updated_at               TEXT NOT NULL,
        deleted_at               TEXT
      );

      CREATE TABLE usuario (
        id             TEXT PRIMARY KEY,
        nombre         TEXT NOT NULL,
        rol            TEXT NOT NULL DEFAULT 'admin',  -- admin | cajero
        pin_hash       TEXT,
        activo         INTEGER NOT NULL DEFAULT 1,
        permisos_json  TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL,
        deleted_at     TEXT
      );

      CREATE TABLE caja (
        id          TEXT PRIMARY KEY,
        nombre      TEXT NOT NULL,
        ubicacion   TEXT,
        activa      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      );

      -- Catálogo ---------------------------------------------------------------
      CREATE TABLE departamento (
        id          TEXT PRIMARY KEY,
        nombre      TEXT NOT NULL,
        activo      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      );

      CREATE TABLE producto (
        id                     TEXT PRIMARY KEY,
        codigo_barra           TEXT,
        descripcion            TEXT NOT NULL,
        tipo_venta             TEXT NOT NULL DEFAULT 'unidad', -- unidad|granel|paquete|kit
        unidad_medida          TEXT,
        costo                  REAL NOT NULL DEFAULT 0,
        pct_ganancia           REAL NOT NULL DEFAULT 0,
        precio_venta           REAL NOT NULL DEFAULT 0,
        precio_mayoreo         REAL,
        departamento_id        TEXT REFERENCES departamento(id),
        impuesto_tipo          TEXT NOT NULL DEFAULT 'itbis18', -- itbis18|itbis16|exento|otro
        tasa_impuesto          REAL NOT NULL DEFAULT 0.18,
        existencia             REAL,        -- NULL si inventario off (MVP)
        politica_sin_existencia TEXT NOT NULL DEFAULT 'advertir', -- bloquear|advertir
        activo                 INTEGER NOT NULL DEFAULT 1,
        created_at             TEXT NOT NULL,
        updated_at             TEXT NOT NULL,
        deleted_at             TEXT
      );
      -- Único solo cuando el código de barra existe (permite varios NULL).
      CREATE UNIQUE INDEX ux_producto_codigo_barra
        ON producto(codigo_barra) WHERE codigo_barra IS NOT NULL AND deleted_at IS NULL;

      -- Clientes ---------------------------------------------------------------
      CREATE TABLE cliente (
        id               TEXT PRIMARY KEY,
        nombre           TEXT NOT NULL,
        apellidos        TEXT,
        telefono         TEXT,
        correo           TEXT,
        direccion        TEXT,
        comentarios      TEXT,
        aplica_credito   INTEGER NOT NULL DEFAULT 0,
        limite_credito   REAL NOT NULL DEFAULT 0,
        saldo_credito    REAL NOT NULL DEFAULT 0,
        documento_tipo   TEXT,   -- rnc | cedula | NULL
        documento_numero TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        deleted_at       TEXT
      );

      -- Ventas -----------------------------------------------------------------
      CREATE TABLE factura (
        id                TEXT PRIMARY KEY,
        numero_interno    INTEGER,
        fecha_hora        TEXT NOT NULL,
        cliente_id        TEXT REFERENCES cliente(id),
        caja_id           TEXT REFERENCES caja(id),
        usuario_id        TEXT REFERENCES usuario(id),
        tipo              TEXT NOT NULL DEFAULT 'normal', -- normal | fiscal (fiscal en Fase 2)
        subtotal_gravado  REAL NOT NULL DEFAULT 0,
        subtotal_exento   REAL NOT NULL DEFAULT 0,
        total_itbis       REAL NOT NULL DEFAULT 0,
        total             REAL NOT NULL DEFAULT 0,
        monto_pagado      REAL NOT NULL DEFAULT 0,
        cambio            REAL NOT NULL DEFAULT 0,
        notas             TEXT,
        estado            TEXT NOT NULL DEFAULT 'abierta', -- abierta|cobrada|anulada
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        deleted_at        TEXT
      );

      CREATE TABLE factura_linea (
        id              TEXT PRIMARY KEY,
        factura_id      TEXT NOT NULL REFERENCES factura(id),
        producto_id     TEXT REFERENCES producto(id), -- NULL si no registrado
        descripcion     TEXT NOT NULL,
        cantidad        REAL NOT NULL DEFAULT 1,
        precio_unitario REAL NOT NULL DEFAULT 0,
        es_mayoreo      INTEGER NOT NULL DEFAULT 0,
        impuesto_tipo   TEXT NOT NULL DEFAULT 'itbis18',
        tasa_impuesto   REAL NOT NULL DEFAULT 0.18,
        monto_itbis     REAL NOT NULL DEFAULT 0,
        subtotal        REAL NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT
      );
      CREATE INDEX ix_factura_linea_factura ON factura_linea(factura_id);

      CREATE TABLE pago (
        id          TEXT PRIMARY KEY,
        factura_id  TEXT NOT NULL REFERENCES factura(id),
        metodo      TEXT NOT NULL, -- efectivo|transferencia|credito|tarjeta
        monto       REAL NOT NULL DEFAULT 0,
        referencia  TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      );
      CREATE INDEX ix_pago_factura ON pago(factura_id);
    `,
  },
  {
    id: 2,
    nombre: "fiscal_ecf",
    sql: /* sql */ `
      -- Secuencias autorizadas por la DGII, por tipo de e-CF -------------------
      CREATE TABLE secuencia_ncf (
        id              TEXT PRIMARY KEY,
        tipo_ecf        TEXT NOT NULL, -- '31'|'32'|'33'|'34'|'41'|'43'|'44'|'45'|'46'|'47'
        prefijo         TEXT NOT NULL, -- 'E31', 'E32', ...
        modo            TEXT NOT NULL DEFAULT 'ecf', -- ecf|ncf_papel|contingencia
        rango_desde     INTEGER NOT NULL,
        rango_hasta     INTEGER NOT NULL,
        proximo_numero  INTEGER NOT NULL,
        vencimiento     TEXT NOT NULL, -- fecha ISO (date)
        estado          TEXT NOT NULL DEFAULT 'disponible', -- disponible|agotada|vencida
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT
      );

      -- Comprobantes fiscales emitidos, uno por factura marcada fiscal --------
      CREATE TABLE comprobante_fiscal (
        id                       TEXT PRIMARY KEY,
        factura_id               TEXT NOT NULL REFERENCES factura(id),
        tipo_ecf                 TEXT NOT NULL,
        ncf                      TEXT NOT NULL,
        secuencia_id             TEXT NOT NULL REFERENCES secuencia_ncf(id),
        rnc_emisor               TEXT,
        receptor_documento_tipo  TEXT,   -- rnc | cedula | NULL
        receptor_documento_numero TEXT,
        fecha_emision            TEXT NOT NULL,
        monto_gravado            REAL NOT NULL DEFAULT 0,
        monto_exento             REAL NOT NULL DEFAULT 0,
        monto_itbis              REAL NOT NULL DEFAULT 0,
        total                    REAL NOT NULL DEFAULT 0,
        estado_dgii              TEXT NOT NULL DEFAULT 'pendiente', -- pendiente|aceptado|rechazado|contingencia
        track_id_dgii            TEXT,
        codigo_seguridad         TEXT,
        xml_firmado_ruta         TEXT,
        qr_url                   TEXT,
        fecha_transmision        TEXT,
        created_at               TEXT NOT NULL,
        updated_at               TEXT NOT NULL,
        deleted_at               TEXT
      );
      CREATE UNIQUE INDEX ux_comprobante_fiscal_ncf ON comprobante_fiscal(ncf);
      CREATE INDEX ix_comprobante_fiscal_factura ON comprobante_fiscal(factura_id);

      -- Enlace desde la factura a su comprobante fiscal (NULL si es normal) ---
      ALTER TABLE factura ADD COLUMN comprobante_id TEXT REFERENCES comprobante_fiscal(id);
    `,
  },
  {
    id: 3,
    nombre: "corte_caja",
    sql: /* sql */ `
      -- Corte de caja: cierre de un período, con efectivo esperado vs contado --
      CREATE TABLE corte_caja (
        id                   TEXT PRIMARY KEY,
        caja_id              TEXT REFERENCES caja(id),
        usuario_id           TEXT REFERENCES usuario(id),
        fecha_apertura       TEXT NOT NULL, -- inicio del período cubierto (fecha, inclusive)
        fecha_cierre         TEXT NOT NULL, -- fin del período cubierto (fecha, inclusive)
        monto_inicial        REAL NOT NULL DEFAULT 0, -- fondo de caja al abrir
        total_ventas         REAL NOT NULL DEFAULT 0,
        total_itbis           REAL NOT NULL DEFAULT 0,
        total_efectivo       REAL NOT NULL DEFAULT 0,
        total_tarjeta        REAL NOT NULL DEFAULT 0,
        total_transferencia  REAL NOT NULL DEFAULT 0,
        total_credito        REAL NOT NULL DEFAULT 0,
        efectivo_esperado    REAL NOT NULL DEFAULT 0, -- monto_inicial + total_efectivo
        efectivo_contado     REAL NOT NULL DEFAULT 0, -- ingresado manualmente al cerrar
        diferencia           REAL NOT NULL DEFAULT 0, -- efectivo_contado - efectivo_esperado
        estado               TEXT NOT NULL DEFAULT 'cerrado', -- abierto|cerrado
        created_at           TEXT NOT NULL,
        updated_at           TEXT NOT NULL,
        deleted_at           TEXT
      );
      CREATE INDEX ix_corte_caja_fecha_cierre ON corte_caja(fecha_cierre);
    `,
  },
  {
    id: 4,
    nombre: "movimiento_inventario",
    sql: /* sql */ `
      -- Historial de existencia (§ Inventario). Con inventario off no se genera nada.
      CREATE TABLE movimiento_inventario (
        id              TEXT PRIMARY KEY,
        producto_id     TEXT NOT NULL REFERENCES producto(id),
        tipo            TEXT NOT NULL, -- entrada|salida|ajuste|venta|compra
        cantidad        REAL NOT NULL, -- delta con signo (positivo entra, negativo sale)
        costo           REAL,
        referencia_tipo TEXT,
        referencia_id   TEXT,
        fecha           TEXT NOT NULL,
        usuario_id      TEXT REFERENCES usuario(id),
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT
      );
      CREATE INDEX ix_movimiento_inventario_producto ON movimiento_inventario(producto_id);
    `,
  },
  {
    id: 5,
    nombre: "compras",
    sql: /* sql */ `
      -- Compras e inventario (con archivado) ----------------------------------
      CREATE TABLE proveedor (
        id          TEXT PRIMARY KEY,
        nombre      TEXT NOT NULL,
        rnc         TEXT,
        telefono    TEXT,
        correo      TEXT,
        direccion   TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      );

      -- Se registra SIEMPRE (inventario on u off): historial de costo y llegada.
      CREATE TABLE compra (
        id                        TEXT PRIMARY KEY,
        fecha                     TEXT NOT NULL,
        proveedor_id              TEXT REFERENCES proveedor(id),
        subtotal                  REAL NOT NULL DEFAULT 0,
        itbis                     REAL NOT NULL DEFAULT 0,
        total                     REAL NOT NULL DEFAULT 0,
        ncf_proveedor             TEXT,
        tiene_comprobante_fiscal  INTEGER NOT NULL DEFAULT 0,
        mes_ano_contable          TEXT NOT NULL, -- 'AAAA-MM'
        estado_clasificacion      TEXT NOT NULL DEFAULT 'sin_fiscal', -- con_fiscal|sin_fiscal|pendiente_revision
        origen                    TEXT NOT NULL DEFAULT 'manual', -- manual|chatbot (Fase 3)
        notas                     TEXT,
        created_at                TEXT NOT NULL,
        updated_at                TEXT NOT NULL,
        deleted_at                TEXT
      );
      CREATE INDEX ix_compra_fecha ON compra(fecha);
      CREATE INDEX ix_compra_mes_ano ON compra(mes_ano_contable);

      CREATE TABLE compra_linea (
        id              TEXT PRIMARY KEY,
        compra_id       TEXT NOT NULL REFERENCES compra(id),
        producto_id     TEXT REFERENCES producto(id), -- NULL si es un producto nuevo/no registrado
        descripcion     TEXT NOT NULL,
        cantidad        REAL NOT NULL DEFAULT 1,
        costo_unitario  REAL NOT NULL DEFAULT 0,
        impuesto_tipo   TEXT NOT NULL DEFAULT 'itbis18',
        tasa_impuesto   REAL NOT NULL DEFAULT 0.18,
        monto_itbis     REAL NOT NULL DEFAULT 0,
        subtotal        REAL NOT NULL DEFAULT 0,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT
      );
      CREATE INDEX ix_compra_linea_compra ON compra_linea(compra_id);

      -- Archivo del comprobante (foto/PDF), guardado inline como base64: en modo
      -- 100% local (SQLite) no hay Storage todavía (llega con el backend en
      -- Fase 2 avanzada). "identificado_por"/"datos_extraidos_json" quedan listos
      -- para cuando el chatbot con visión (Fase 3) archive automáticamente.
      CREATE TABLE comprobante_archivo (
        id                    TEXT PRIMARY KEY,
        compra_id             TEXT REFERENCES compra(id),
        nombre_archivo        TEXT NOT NULL,
        tipo_mime             TEXT NOT NULL,
        contenido_base64      TEXT NOT NULL,
        mes_ano               TEXT NOT NULL, -- 'AAAA-MM'
        tiene_fiscal          INTEGER NOT NULL DEFAULT 0,
        estado_revision       TEXT NOT NULL DEFAULT 'confirmado_usuario', -- auto|confirmado_usuario|pendiente
        identificado_por      TEXT NOT NULL DEFAULT 'usuario', -- chatbot|usuario
        datos_extraidos_json  TEXT,
        created_at            TEXT NOT NULL,
        updated_at            TEXT NOT NULL,
        deleted_at            TEXT
      );
      CREATE INDEX ix_comprobante_archivo_compra ON comprobante_archivo(compra_id);
    `,
  },
  {
    id: 6,
    nombre: "bitacora",
    sql: /* sql */ `
      -- Bitácora de acciones (§ Caja y auditoría): registro de quién y cuándo
      -- para acciones sensibles (eliminar, cobrar, comprar, cerrar caja, ajustar
      -- existencia). Requisito de seguridad (sección 8 del prompt original).
      CREATE TABLE bitacora_accion (
        id          TEXT PRIMARY KEY,
        usuario_id  TEXT REFERENCES usuario(id),
        origen      TEXT NOT NULL DEFAULT 'app', -- app|chatbot (chatbot en Fase 3)
        accion      TEXT NOT NULL, -- ej. 'eliminar', 'cobrar', 'registrar_compra'
        entidad     TEXT NOT NULL, -- ej. 'producto', 'factura', 'compra'
        entidad_id  TEXT,
        resumen     TEXT,
        confirmada  INTEGER NOT NULL DEFAULT 1, -- bool
        timestamp   TEXT NOT NULL
      );
      CREATE INDEX ix_bitacora_accion_entidad ON bitacora_accion(entidad, entidad_id);
      CREATE INDEX ix_bitacora_accion_timestamp ON bitacora_accion(timestamp);
    `,
  },
  {
    id: 7,
    nombre: "devoluciones",
    sql: /* sql */ `
      -- Devoluciones (§ Ventas): devolver artículos de una venta ya cobrada.
      -- Si la venta original fue fiscal, se exige una Nota de Crédito (E34)
      -- referenciando el NCF original antes de completar la devolución.
      CREATE TABLE devolucion (
        id              TEXT PRIMARY KEY,
        factura_id      TEXT NOT NULL REFERENCES factura(id),
        fecha           TEXT NOT NULL,
        motivo          TEXT,
        subtotal        REAL NOT NULL DEFAULT 0,
        itbis           REAL NOT NULL DEFAULT 0,
        total           REAL NOT NULL DEFAULT 0,
        comprobante_id  TEXT REFERENCES comprobante_fiscal(id), -- NC E34, NULL si venta no fiscal
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL,
        deleted_at      TEXT
      );
      CREATE INDEX ix_devolucion_factura ON devolucion(factura_id);

      CREATE TABLE devolucion_linea (
        id                TEXT PRIMARY KEY,
        devolucion_id     TEXT NOT NULL REFERENCES devolucion(id),
        factura_linea_id  TEXT NOT NULL REFERENCES factura_linea(id),
        producto_id       TEXT REFERENCES producto(id),
        descripcion       TEXT NOT NULL,
        cantidad          REAL NOT NULL,
        precio_unitario   REAL NOT NULL,
        impuesto_tipo     TEXT NOT NULL,
        tasa_impuesto     REAL NOT NULL,
        monto_itbis       REAL NOT NULL,
        subtotal          REAL NOT NULL,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        deleted_at        TEXT
      );
      CREATE INDEX ix_devolucion_linea_devolucion ON devolucion_linea(devolucion_id);
      CREATE INDEX ix_devolucion_linea_factura_linea ON devolucion_linea(factura_linea_id);
    `,
  },
  {
    id: 8,
    nombre: "promociones",
    sql: /* sql */ `
      -- Promociones (§ Fase 3): descuento por producto o departamento, con
      -- vigencia. Se aplica automáticamente al agregar el producto a un
      -- ticket en Ventas (ajusta el precio unitario de esa línea).
      CREATE TABLE promocion (
        id               TEXT PRIMARY KEY,
        nombre           TEXT NOT NULL,
        tipo             TEXT NOT NULL, -- porcentaje|monto_fijo
        valor            REAL NOT NULL,
        aplica_a         TEXT NOT NULL DEFAULT 'producto', -- producto|departamento|todo
        producto_id      TEXT REFERENCES producto(id),
        departamento_id  TEXT REFERENCES departamento(id),
        fecha_inicio     TEXT NOT NULL, -- fecha ISO (date)
        fecha_fin        TEXT NOT NULL, -- fecha ISO (date)
        activa           INTEGER NOT NULL DEFAULT 1,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        deleted_at       TEXT
      );
      CREATE INDEX ix_promocion_producto ON promocion(producto_id);
      CREATE INDEX ix_promocion_departamento ON promocion(departamento_id);
      CREATE INDEX ix_promocion_vigencia ON promocion(fecha_inicio, fecha_fin);
    `,
  },
];
