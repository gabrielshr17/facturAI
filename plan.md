# Diseño: Sistema de facturación, inventario y gestión (República Dominicana)

## Context

El repositorio está vacío (proyecto greenfield). El documento de especificación (`prompt-sistema-facturacion.md`, Anexo A) pide explícitamente **no escribir código todavía** y entregar primero: (a) arquitectura propuesta, (b) modelo de datos definitivo y (c) decisiones pendientes. Este plan ES ese entregable. La implementación posterior se hará **por fases** (sección 3) y el **módulo fiscal se explica y aprueba aparte** antes de codificarse (Anexo B).

**Hallazgo crítico que cambia el diseño:** verifiqué la normativa DGII vigente a junio 2026. La **facturación electrónica (e-CF, Ley 32-23) es obligatoria**; para contribuyentes pequeños/micro/no clasificados el plazo final es el **15 de noviembre de 2026** (~5 meses). El e-CF no es el NCF en papel de la sección 6: requiere **XML estructurado, firma digital con certificado, transmisión a la DGII para aprobación, representación impresa con QR y modo contingencia**. Por decisión del usuario, **diseñamos para e-CF desde el inicio**.

## Decisiones tomadas (confirmadas con el usuario)

1. **Modelo fiscal:** diseñar para **e-CF desde ya** (arquitectura y datos soportan XML, firma, transmisión DGII y contingencia). Cumple el mandato de nov-2026.
2. **Stack escritorio/backend (Anexo A):** **Tauri** para escritorio Windows (WebView + Rust), **Node + Fastify** como backend, y **Supabase SOLO para auth/autorización**. La nube (Postgres/Storage/e-CF) se sirve desde Fastify, no desde Edge Functions.
3. **Inventario activo, venta sin existencia:** **configurable por producto** (`bloquear` vs `advertir`).

> **Implicaciones de Tauri** (sustituyen lo que originalmente se escribió para Electron):
> - **Hardware** (impresora ESC/POS, gaveta, báscula, lector): vía **Rust** (comando nativo o *sidecar* binario), no `serialport`/`node-hid`/`node-thermal-printer` de Node.
> - **SQLite local:** **`tauri-plugin-sql` (rusqlite)** en escritorio; **`wa-sqlite`** en la PWA. El `core` de dominio queda agnóstico tras una interfaz de repositorio.

## Decisiones recomendadas (las fijo salvo que el usuario objete)

- **Motor de sincronización:** **PowerSync** sobre ElectricSQL. Más maduro en producción, servicio gestionado, integración oficial con Supabase y resolución de conflictos local-first. Requiere claves primarias **UUID generadas en el cliente** y borrado lógico (`deleted_at`).
- **IA (chatbot + visión):** **Claude** vía API de Anthropic, detrás de un **endpoint del backend Fastify** (la API key nunca vive en el cliente). Lectura de fotos de facturas y chat con *tool calling* usando **`claude-opus-4-8`** (visión + razonamiento); enrutar mensajes simples a **`claude-haiku-4-5`** para abaratar. Toda acción que cree/cobre/modifique/elimine pasa por confirmación explícita en la capa de app y queda en bitácora.
- **Transmisión e-CF:** abstraer tras una interfaz `ProveedorFiscal` (implementada en el backend Fastify); recomendar usar un **proveedor/PAC certificado** por DGII para el certificado digital y la transmisión (reduce riesgo de cumplimiento), con opción de integración directa al API DGII más adelante. **Pendiente de confirmar** (ver abajo).
- **Monorepo** con pnpm workspaces, una sola base de UI React/TS/Tailwind reutilizada por Tauri (escritorio) y PWA (web/móvil).

## Arquitectura propuesta

### Capas

```
┌──────────────────────────────────────────────────────────────┐
│  UI compartida: React + TypeScript + Tailwind  (paquete `ui`) │
│  Pantallas: Ventas, Cobro, Clientes, Productos, Inventario,   │
│  Compras, Facturas, Corte, Configuración, Chatbot             │
└───────────────┬───────────────────────────┬──────────────────┘
        Tauri (escritorio Win)          PWA (web + móvil)
        - hardware vía Rust             - cámara (getUserMedia)
        - ESC/POS térmica (Rust)        - impresión → PDF/navegador
        - lector/gaveta/báscula         - instalable, offline
                │                               │
        ┌───────┴───────────────────────────────┴───────┐
        │   Núcleo de dominio (paquete `core`)            │
        │   - reglas de negocio, cálculo precio/ITBIS     │
        │   - capa de datos local-first (repos agnósticos)│
        └───────┬─────────────────────────────────────────┘
                │  SQLite local (tauri-plugin-sql / wa-sqlite)
                │            ▲
                │   PowerSync (sync local-first, colas offline)
                │            ▼
        ┌───────┴───────────────────────────────────────┐
        │  Backend Node + Fastify (nube)                 │
        │  - PostgreSQL (fuente multi-caja/multiusuario) │
        │  - Storage (fotos de comprobantes)             │
        │  - endpoints: IA (Claude) y e-CF (DGII)        │
        │  Supabase: SOLO Auth (roles admin/cajero)      │
        └───────┬───────────────────────────────────────┘
                │
        ┌───────┴────────┐        ┌──────────────────────┐
        │ API Anthropic  │        │ DGII e-CF (vía PAC o  │
        │ (Claude visión │        │ integración directa)  │
        │ + tool calling)│        └──────────────────────┘
        └────────────────┘
```

### Flujo de datos y modos de operación

- **Mono-todo (default):** corre 100% sobre **SQLite local**, sin internet. Ventas, productos, clientes, compras, inventario y corte funcionan offline.
- **Multi-caja/multiusuario:** se activa **PowerSync**; SQLite local sigue siendo la fuente de lectura/escritura instantánea y PowerSync replica contra **Postgres en Supabase**. Conflictos resueltos por *last-write-wins* con `updated_at`, salvo entidades sensibles (secuencias fiscales, corte) que usan operaciones idempotentes/atómicas en servidor.
- **Offline:** toda operación no fiscal se encola y sincroniza al reconectar. El **e-CF** usa **modo contingencia**: si no hay conexión a DGII se emite con secuencia de contingencia y se **encola para transmisión**, transmitiéndose al reconectar (a validar con contable como supuesto).

### IA con visión y carpeta del contable

- El chatbot vive en la pantalla de Ventas y en la PWA móvil (con cámara). Acepta texto, voz (Web Speech API) e **imágenes**.
- Las fotos se suben a **Storage** (servido por Fastify); un **endpoint del backend** llama a **Claude (visión)** para extraer proveedor/RNC/NCF/ITBIS/monto y **clasificar** el comprobante (con fiscal / sin fiscal / dudoso).
- Resultado → registro **Compra** + archivo asociado en carpeta lógica `Comprobantes/AAAA-MM/`. Si la IA **no está segura**, pregunta al usuario antes de archivar. Antes de mover/guardar, muestra lo que identificó (requisito de seguridad sección 8).
- La carpeta vive según el modo: local en escritorio, en Storage en la nube, o ambas sincronizadas en híbrido. Exportable/comprimible por periodo para el contable.

## Modelo de datos definitivo

Convenciones: PK = `id TEXT` (UUID v7 generado en cliente, requisito PowerSync). Todas las tablas sincronizables llevan `created_at`, `updated_at` (timestamptz) y `deleted_at` (borrado lógico). Tipos mostrados en notación Postgres; en SQLite mapean a TEXT/REAL/INTEGER. Montos `NUMERIC(12,2)`, tasas `NUMERIC(5,4)`.

### Configuración / acceso
- **negocio:** id, nombre_comercial, razon_social, rnc, direccion, telefono, correo, logo_ruta, regimen, datos_certificado_fiscal_ref, ancho_impresora_default (58/80), redondeo_centavo (bool), inventario_activo (bool).
- **usuario:** id, nombre, rol (`admin`|`cajero`), pin_hash, activo, permisos_json (descuentos, anular, ver_corte).
- **caja:** id, nombre, ubicacion, activa.

### Catálogo
- **departamento:** id, nombre, activo.
- **producto:** id, codigo_barra (NULL, único si existe), descripcion, tipo_venta (`unidad`|`granel`|`paquete`|`kit`), unidad_medida, costo, pct_ganancia, precio_venta, precio_mayoreo, departamento_id (FK→departamento, NULL), impuesto_tipo (`itbis18`|`itbis16`|`exento`|`otro`), tasa_impuesto, **existencia** (NULL si inventario off), **politica_sin_existencia** (`bloquear`|`advertir`, default `advertir`), activo.
  - *Inventario OFF:* `existencia` y `politica_sin_existencia` se ignoran; el producto se vende siempre.
- **promocion:** id, descripcion, tipo (`pct`|`monto`|`2x1`), valor, alcance (`producto`|`departamento`), referencia_id, vigencia_desde, vigencia_hasta, activa.

### Clientes / proveedores
- **cliente:** id, nombre, apellidos, telefono, correo, direccion, comentarios, aplica_credito (bool), limite_credito, saldo_credito, documento_tipo (`rnc`|`cedula`|NULL), documento_numero (NULL).
- **proveedor:** id, nombre, rnc, telefono, correo, direccion.

### Ventas
- **factura:** id, numero_interno, fecha_hora, cliente_id (FK, NULL), caja_id (FK), usuario_id (FK), tipo (`normal`|`fiscal`), subtotal_gravado, subtotal_exento, total_itbis, total, monto_pagado, cambio, notas, estado (`abierta`|`cobrada`|`anulada`), comprobante_id (FK→comprobante_fiscal, NULL).
- **factura_linea:** id, factura_id (FK), producto_id (FK, NULL si no registrado), descripcion, cantidad, precio_unitario, es_mayoreo (bool), impuesto_tipo, tasa_impuesto, monto_itbis, subtotal.
- **pago:** id, factura_id (FK), metodo (`efectivo`|`transferencia`|`credito`|`tarjeta`), monto, referencia (NULL). (Soporta pago **mixto**: varias filas por factura.)
- **devolucion:** id, factura_id (FK), fecha, motivo, total, comprobante_id (NULL, nota de crédito E34).

### Fiscal (e-CF)
- **secuencia_ncf:** id, tipo_ecf (`31`|`32`|`33`|`34`|`41`|`43`|`44`|`45`|`46`|`47`), prefijo (`E31`…), modo (`ecf`|`ncf_papel`|`contingencia`), rango_desde, rango_hasta, proximo_numero, vencimiento (date), estado (`disponible`|`agotada`|`vencida`).
- **comprobante_fiscal:** id, factura_id (FK), tipo_ecf, ncf (código completo, p.ej. `E320000000001`), secuencia_id (FK), rnc_emisor, receptor_documento_tipo, receptor_documento_numero (NULL en consumo), fecha_emision, monto_gravado, monto_exento, monto_itbis, total, **estado_dgii** (`pendiente`|`aceptado`|`rechazado`|`contingencia`), track_id_dgii (NULL), codigo_seguridad (NULL), xml_firmado_ruta (NULL), qr_url (NULL), fecha_transmision (NULL).

### Compras e inventario
- **compra:** id, fecha, proveedor_id (FK, NULL), subtotal, itbis, total, ncf_proveedor (NULL), **tiene_comprobante_fiscal** (bool), **ruta_comprobante** (Storage/local), **mes_ano_contable** (`AAAA-MM`), estado_clasificacion (`con_fiscal`|`sin_fiscal`|`pendiente_revision`), origen (`manual`|`chatbot`).
  - *Se registra SIEMPRE, con inventario on u off* (historial de costo y fecha de llegada).
- **compra_linea:** id, compra_id (FK), producto_id (FK, NULL si nuevo), descripcion, cantidad, costo_unitario, subtotal.
- **comprobante_archivo:** id, compra_id (FK, NULL), ruta_archivo, mes_ano (`AAAA-MM`), tiene_fiscal (bool), estado_revision (`auto`|`confirmado_usuario`|`pendiente`), identificado_por (`chatbot`|`usuario`), datos_extraidos_json.
- **movimiento_inventario:** id, producto_id (FK), tipo (`entrada`|`salida`|`ajuste`|`venta`|`compra`), cantidad, costo, referencia_tipo, referencia_id, fecha, usuario_id.
  - *Inventario OFF:* no se generan movimientos ni se valida existencia.

### Caja y auditoría
- **corte_caja:** id, caja_id (FK), usuario_id (FK), fecha_apertura, fecha_cierre (NULL), monto_inicial, total_ventas, total_efectivo, total_tarjeta, total_transferencia, total_credito, total_itbis, ganancia, estado (`abierto`|`cerrado`).
- **bitacora_accion:** id, usuario_id, origen (`app`|`chatbot`), accion, entidad, entidad_id, resumen, confirmada (bool), timestamp. (Cumple el registro "quién y cuándo" de la sección 8.)

## Módulo fiscal e-CF — resumen (explicación detallada antes de codificar)

Por el Anexo B, **antes de implementar la Fase 2 fiscal** entrego una explicación clara y la valido con el usuario. Resumen de lo verificado en DGII (jun-2026):

- **Formato e-CF:** `E` + tipo(2) + secuencial(10) = 13 caracteres. (NCF papel: `B` + 2 + 8 = 11.)
- **Tipos relevantes para un comercio:** **E32 Consumo** (consumidor final, sin RNC salvo montos altos) y **E31 Crédito Fiscal** (B2B, requiere RNC del receptor, da derecho a crédito de ITBIS). **E34 Nota de Crédito** (devoluciones), **E33 Nota de Débito**. Otros: 41 Compras, 43 Gastos Menores, 44 Regímenes Especiales, 45 Gubernamental, 46 Exportaciones, 47 Pagos al Exterior.
- **Secuencias:** rangos autorizados por DGII con vencimiento; al agotarse/vencer hay que solicitar nuevas. El sistema avisa por umbral bajo y bloquea emisión si no hay secuencia válida.
- **RNC/Cédula:** RNC = 9 dígitos, Cédula = 11 dígitos, ambos con dígito verificador (validable localmente) y verificable contra el padrón DGII opcionalmente.
- **ITBIS:** 18% estándar, 16% reducido en ciertos bienes, exento (0). La factura fiscal **separa gravado, ITBIS y exento**.
- **Flujo e-CF:** generar XML (esquema DGII) → firmar con certificado digital → transmitir a DGII → recibir aceptación/rechazo + código de seguridad → entregar **Representación Impresa con QR**. **Contingencia** cuando DGII no está disponible.

## Stack y librerías concretas

- **UI:** React + TypeScript + Tailwind + Vite (paquete `ui`).
- **Escritorio:** Tauri (WebView + Rust); hardware vía Rust: puerto serie (báscula/gaveta), lectores HID (muchos funcionan como *keyboard wedge* sin driver), capa **ESC/POS** en Rust con autodetección 58/80mm.
- **Web/móvil:** misma app como **PWA** (instalable, offline, `getUserMedia` para cámara, Web Speech API para voz); impresión → PDF (`pdf-lib`) / impresión del navegador.
- **Datos:** SQLite (`tauri-plugin-sql`/rusqlite en escritorio, `wa-sqlite` en PWA) + **PowerSync** ↔ **Postgres**.
- **Backend:** Node + Fastify (Storage de comprobantes, endpoints de IA y e-CF); **Supabase solo para Auth** (roles admin/cajero).
- **IA:** Anthropic Claude (`claude-opus-4-8` visión/tool-calling; `claude-haiku-4-5` para mensajes simples) detrás de un endpoint Fastify.
- **Fiscal:** módulo `fiscal` con interfaz `ProveedorFiscal` (PAC certificado o integración directa DGII).

## Fases de implementación (no avanzar sin terminar la anterior)

- **Fase 0 — Andamiaje:** monorepo pnpm, paquetes `ui`/`core`/`desktop` (Tauri)/`web` (PWA)/`fiscal`, esquema SQLite + migraciones, shell de Tauri y PWA que levantan, tablas del MVP creadas + seeds (sin lógica fiscal ni sync).
- **Fase 1 (MVP, sección 3):** Ventas → Cobro → Productos (alta/edición/baja) → Clientes básicos → Configuración mínima. 100% local sobre SQLite. Incluye cálculo precio (costo+%/manual), redondeo a 2 decimales/centavo, pago mixto, impresión. Sub-fases: 1.1 núcleo `core` con tests, 1.2 Productos/Clientes/Config, 1.3 Ventas, 1.4 Cobro+impresión.
- **Fase 2 (Fiscal y abastecimiento):** **primero** explicar+validar e-CF (Anexo B); luego e-CF (emisión, secuencias, contingencia, RI+QR), Compras (con archivado), Inventario (configurable, política por producto), Consulta de facturas, Corte de caja. Aquí se activa el backend Fastify + Supabase Auth + PowerSync y el endpoint de e-CF.
- **Fase 3 (Inteligencia):** Chatbot Claude con voz y visión (lectura de facturas + archivado para contable), reportes avanzados, promociones, importar/exportar.

## Verificación (cómo se prueba cada fase)

- **Modelo de datos:** migraciones aplican limpio en SQLite y Postgres; *seeds* de ejemplo (producto completo, factura normal, factura e-CF con desglose ITBIS + producto exento — sección 10).
- **Fase 1:** levantar Tauri (`pnpm dev:desktop`) y PWA (`pnpm dev:web`); flujo escanear→cobrar→imprimir; pruebas unitarias de cálculo de precio/ITBIS/redondeo y pago mixto.
- **Fase 2:** emitir un E32 y un E31 en *sandbox* DGII/PAC, validar XML, RI con QR, manejo de secuencia agotada/vencida y contingencia offline→transmisión al reconectar; registrar una compra con y sin comprobante.
- **Fase 3:** subir foto de factura → la IA extrae y clasifica → confirma con el usuario → crea Compra + archivo en `Comprobantes/AAAA-MM/`; verificar bitácora de acciones del chatbot y confirmación previa obligatoria.
- **Sync:** dos cajas, una offline; al reconectar, los datos convergen sin perder secuencias fiscales.

## Decisiones aún pendientes (para el usuario)

1. **Transmisión e-CF:** ¿PAC certificado (recomendado, menor riesgo) o integración directa al API de la DGII? Afecta certificado digital, costos y tiempos.
2. **Modo contingencia offline para e-CF:** confirmar con el contable la política exacta (qué tipos se permiten emitir offline y plazo de transmisión).
3. **Certificado digital:** quién lo provee y cómo se almacena de forma segura (no en cliente).
4. **Alcance de voz:** Web Speech API del navegador (gratis, depende de conexión/navegador) vs servicio de transcripción dedicado.

## Próximo paso

Al aprobar este diseño, comenzamos por **Fase 0 (andamiaje + modelo de datos)** y luego **Fase 1 (MVP)**. El módulo fiscal se explica y valida (Anexo B) antes de codificar la Fase 2.