# Prompt: Sistema de facturación, inventario y gestión de negocio (República Dominicana)

## 0. Cómo usar este prompt

Este sistema es grande. No pidas todo de una sola vez. Sigue este orden con el asistente:

1. **Primero**, pídele que lea el documento completo y devuelva: (a) la **arquitectura propuesta**, (b) el **modelo de datos** definitivo, y (c) cualquier **duda o decisión pendiente**. No debe escribir código todavía.
2. **Luego**, valida con él el **Módulo fiscal (NCF)** por separado, porque es el de mayor riesgo de error.
3. **Después**, implementen **módulo por módulo** siguiendo las fases de la sección 3.

---

## 1. Rol

Eres un programador senior con experiencia en sistemas de punto de venta (POS) y administración de negocios, y conoces el marco tributario de la República Dominicana (DGII, ITBIS, NCF, RNC).

Antes de programar cualquier módulo: si algo es ambiguo, **pregunta**. Si una regla de negocio no está definida, **propón** una opción razonable y márcala como supuesto.

---

## 2. Contexto técnico

### 2.1 Requisitos

- **Plataforma:** **Híbrida.**
  - **Escritorio Windows** = versión completa (registrar y configurar).
  - **Web y móvil** = acceso para **facturar, consultar precios y usar el chatbot de IA**, incluyendo **tomar fotos de facturas con la cámara del teléfono** para subirlas al bot.
- **Base de datos:** **Híbrida.** Debe poder operar local, en la nube o ambas. Por defecto local.
- **Usuarios y cajas:** **Configurable y escalable.** Soporta mono/multi usuario y mono/multi caja. **Default: mono todo**, pero la arquitectura debe permitir crecer a multi sin rehacerla.
- **Conectividad:** Debe funcionar **online y offline**, sincronizando al reconectar.
- **Impresión:** **Ajustable según la impresora conectada** (detecta y se adapta a 58/80mm). Más PDF/correo.
- **Hardware (todo opcional):** lector de código de barras, gaveta de dinero, báscula/peso, impresora.

### 2.2 Stack a usar

- **UI compartida:** React + TypeScript + Tailwind. Una sola base de código de interfaz reutilizada en escritorio, web y móvil.
- **Escritorio Windows (versión completa):** **Electron** envolviendo la app de React. Da acceso a hardware vía Node: `serialport` (báscula/gaveta), librerías **ESC/POS** (impresión térmica), `node-hid` (lectores).
- **Web + móvil (facturar / consultar precios):** la **misma app de React como PWA**, instalable y con soporte offline. Sin segundo código.
- **Motores de base de datos:**
  - **SQLite** = local, embebido. En modo "mono todo" el sistema corre 100% sobre SQLite sin internet.
  - **PostgreSQL** = nube, se activa al escalar a multi-caja/multi-usuario.
- **Sincronización (clave para híbrido + offline):** motor local-first que mantenga **SQLite ↔ PostgreSQL** y resuelva reconexión. Evaluar **PowerSync** o **ElectricSQL** y elegir el más maduro al iniciar.
- **Backend/API:** **Supabase** (Postgres + autenticación + funciones en la nube, ya armados para roles, multiusuario y llamadas del chatbot) o **Node + Fastify** si se prefiere control total.
- **Impresión:** capa ESC/POS en Electron que detecta la impresora y ajusta el ancho; abstraída tras una interfaz para que web/móvil caigan a PDF / impresión del navegador.
- **Roles y permisos:** admin y cajero como mínimo. Definir quién puede dar descuentos, anular facturas y ver el corte. Activos al pasar a multiusuario.

---

## 3. Alcance y fases

Entrega por fases. No pases a la siguiente sin terminar la anterior.

- **Fase 1 (MVP):** Ventas → Cobro → Productos (nuevo/modificar/eliminar) → Clientes básicos → Configuración mínima.
- **Fase 2 (Fiscal y abastecimiento):** Facturación con NCF → Compras → Inventario → Consulta de facturas → Corte de caja.
- **Fase 3 (Inteligencia):** Chatbot con IA y voz → Reportes/consultas avanzadas → Promociones → Importar/exportar bases de datos.

---

## 4. Modelo de datos

Define primero estas entidades con sus campos y relaciones. Las pantallas deben referenciar este modelo.

- **Producto:** id, código de barra (opcional, único si existe), descripción, tipo de venta (unidad / a granel / paquete / kit), unidad de medida (libra, pieza, etc.), costo, % de ganancia, precio venta, precio mayoreo, departamento (opcional), impuesto (ITBIS / exento / otro), existencia (si inventario activo).
- **Cliente:** id, nombre, apellidos, teléfono, correo, dirección, comentarios, aplica crédito (Sí/No), límite/saldo de crédito, RNC (opcional).
- **Factura:** id, fecha/hora, cliente (opcional), líneas (producto, cantidad, precio, subtotal), total, método(s) de pago, monto pagado, cambio, notas, tipo (normal / con NCF), NCF asignado (si aplica), estado (cobrada / abierta / anulada).
- **NCF:** tipo de comprobante, secuencia, rango autorizado, vencimiento, estado (disponible / usado / vencido).
- **Compra:** id, fecha, proveedor, líneas (producto, cantidad, costo), total, NCF de proveedor (opcional), **tiene comprobante fiscal (Sí/No)**, **ruta del archivo/foto del comprobante**, **mes/año contable** (para agrupación en la carpeta del contable).
- **Departamento, Inventario (movimientos), Caja/Corte.**

---

## 5. Reglas de negocio

- **Código de barra:** opcional. Puede haber productos **sin** código de barra.
- **Venta sin existencia:** en **modo sin inventario** se permite vender con existencia en cero o negativa. (Con inventario activo, definir si se bloquea o solo se advierte.)
- **Cálculo del precio de venta:** se deriva de **costo + % de ganancia**, pero también puede **ingresarse manualmente** (el valor manual manda si está presente). Además, el sistema debe **sugerir precios** consultando en internet cómo se vende el producto en otros establecimientos (búsqueda web), y mostrarlo como sugerencia, no como valor impuesto.
- **Redondeo:** precios y montos a **2 decimales**; el cambio se ajusta al **centavo más cercano**.
- **Inventario deshabilitado:** "existencia" deja de validarse y las compras se registran igual (ver sección Compras) solo para historial de costo y fecha de llegada.
- **Validaciones estándar:** RNC con formato válido, correo con formato válido, y campos obligatorios por pantalla.

---

## 6. Módulo fiscal — Comprobantes Fiscales (NCF)

**Importante:** no conozco el proceso. Antes de programar este módulo, primero **explícame en lenguaje claro**:

1. Los tipos de NCF de la DGII relevantes para un comercio (ej. crédito fiscal, consumo, etc.) y cuándo se usa cada uno.
2. Cómo se manejan las **secuencias autorizadas**, su **rango** y su **vencimiento**.
3. Cómo validar el **RNC** del cliente.
4. El **modelo de datos** necesario para administrar los NCF.

Luego implementa:

- Botón "Factura con comprobante fiscal (NCF)" en Ventas.
- Al presionarlo: campo para RNC del cliente (si no está registrado, opción de agregarlo).
- La factura con NCF se visualiza distinto: **separa el monto gravado del ITBIS**, y marca correctamente los productos **exentos**.
- En **Configuración** debe existir todo lo necesario para emitir NCF (cargar secuencias, tipos, vencimientos, datos del negocio/RNC).

---

## 7. Pantallas / módulos

### 7.1 Ventas (pantalla principal)

- Facturar por **código de barra** o **búsqueda manual**.
- Preview de la factura con: descripción (nombre), código, cantidad, precio, subtotal, total y existencia (si aplica).
- Botones: facturar por cantidad; sumar/restar productos; agregar artículos **no registrados** en la base; precio **al por mayor**; borrar artículo; **verificar precio**.
- Arriba: cada **ticket abierto**; botón para dejar el ticket actual abierto; botón para eliminar el ticket actual; **asignar cliente** (si no está registrado, botón para agregarlo).
- Mostrar **fecha y hora actual** en pantalla.
- Botón **reimprimir último ticket**, **ventas del día** y **devoluciones**.
- Botón **NCF** (ver sección 6).

### 7.2 Cobro

Al presionar **Cobrar**, abrir ventana con:
- Total de la factura y total de artículos.
- Método de pago: efectivo, transferencia, crédito, tarjeta, **mixto**.
- Monto con el que pagó y **cambio**.
- Acciones: **Cobrar e imprimir** (físico POS o digital/PDF), **Cobrar sin imprimir**, **Cancelar (escape)**, **Ingresar notas**.

### 7.3 Clientes

- Visualizar, administrar y agregar clientes (campos en el modelo de datos: nombre, apellidos, teléfono, correo, dirección, comentarios, aplica crédito).
- Lista de clientes existentes + **buscador**.
- Botón **exportar** base de datos de clientes.

### 7.4 Productos

Botones en la parte superior:
- **Nuevo:** registrar producto con todos los campos del modelo (incluye sugerencia de ITBIS/exento **según el código tributario de RD** a partir del tipo de producto). Botones Guardar y Cancelar.
- **Modificar:** buscar por código o manual; al elegir, editar todos los campos.
- **Eliminar.**
- **Departamentos.**
- **Consulta de ventas por periodo.**
- **Promociones.**
- **Importar** base de datos de productos.
- **Catálogo:** con exportar, modificar, actualizar, filtrar por departamento y buscador.

### 7.5 Inventario

- Puede estar **habilitado o no** (configurable). Define claramente el comportamiento del resto del sistema según ese estado.

### 7.6 Compras

- Página para **registrar compras**, **independiente** de si el inventario está habilitado.
- Aunque el inventario esté apagado, debe permitir registrar las facturas recibidas para saber **cuándo llegó** un producto y **a qué costo**.
- Si un producto es **nuevo**, agregarlo de inmediato al catálogo con **precio sugerido** y **consultar** si ese precio está bien.

#### 7.6.1 Organización automática de comprobantes para el contable

- El usuario sube **fotos de facturas de compra** al chatbot de IA (sección 8), sin orden ni formato específico. Debe poder **tomar la foto en el momento con la cámara del teléfono** desde la app móvil/web, además de subir imágenes ya guardadas.
- El bot debe **identificar si la foto contiene un comprobante fiscal válido** (NCF de proveedor, RNC visible, desglose de ITBIS) y clasificarla:
  - **Con comprobante fiscal** → se guarda en una **carpeta dedicada para el contable**, organizada por **mes y año** (ej. `Comprobantes/2026-06/`).
  - **Sin comprobante fiscal** (recibo simple, nota informal, etc.) → se guarda aparte o se notifica al usuario que esa compra no tiene soporte fiscal.
- Cada foto archivada debe quedar **asociada a su registro de Compra** en el sistema (mismo proveedor, fecha, monto), no solo guardada como imagen suelta.
- Al final de mes, debe existir una opción para **exportar/comprimir** la carpeta completa de comprobantes del periodo, lista para entregar al contable.
- Si el bot **no está seguro** de la clasificación (foto borrosa, comprobante incompleto), debe **preguntar al usuario** antes de archivar, no decidir solo.
- Definir dónde vive esta carpeta según el modo de operación (ver sección 2): local en el equipo de escritorio, en la nube, o sincronizada en ambos si el sistema corre híbrido.

### 7.7 Facturas (consulta)

- Buscar y ver facturas en pantalla.
- Imprimir (físico o PDF), guardar copia, enviar por correo.
- Exportar base de datos de facturas **por parámetros**.

### 7.8 Corte de caja

- Balance de venta total, dinero en caja, ganancia.
- Desglose de ventas por método de pago.
- Impuestos.

### 7.9 Configuración

- Configuración general del programa y de cada pantalla.
- Incluye lo necesario para emitir NCF (sección 6), datos del negocio, impresión, impuestos, permisos.

---

## 8. Chatbot con IA y voz

- Apartado de chat en la pantalla de Ventas que acepte información **sin formato específico** y también **entrada de voz**.
- **Disponible desde el teléfono:** el chatbot debe funcionar en la versión web/móvil (PWA), con acceso a la **cámara** para tomar fotos de facturas en el momento y subirlas directamente al bot.
- Funciones: facturar, registrar productos o clientes, consultar precios, dar instrucciones de uso del programa, sugerir precios, configurar inventario, registrar compras y ventas, y asistir en general.
- **Reconocimiento de imágenes (obligatorio para Compras):** el chatbot debe aceptar **fotos** y usar un modelo con **visión** para leer facturas de compra, identificar si tienen comprobante fiscal válido, y archivarlas según la sección 7.6.1.
- **Seguridad (obligatorio):** toda acción que cree, cobre, modifique o elimine datos debe **pedir confirmación** antes de ejecutarse, mostrar un resumen de lo que va a hacer, y quedar registrada (quién y cuándo). Esto incluye el **archivado de comprobantes**: el bot muestra qué identificó antes de mover/guardar el archivo.
- Especifica qué modelo de IA usar y cómo accede a las funciones del sistema (tool calling / funciones expuestas).

---

## 9. Requisitos no funcionales

- Velocidad: el escaneo de código de barras debe agregar el producto al instante.
- Impresión POS según el tamaño definido en Contexto técnico.
- Manejo de errores claro (producto no encontrado, NCF agotado/vencido, sin existencia, etc.).
- Respaldos / exportación de datos.

---

## 10. Ejemplos (para eliminar ambigüedad)

Antes de cerrar el diseño, genera y muéstrame:
- Un **producto** de ejemplo lleno con todos sus campos.
- Una **factura normal** de ejemplo.
- Una **factura con NCF** mostrando el desglose de ITBIS y un producto exento.

---

## 11. Entregables y criterios de aceptación

- Por cada fase: código funcional + breve explicación de cómo probarlo.
- El sistema cumple las reglas de negocio de la sección 5 sin inconsistencias.
- El módulo fiscal genera NCF con secuencia, vencimiento y desglose de ITBIS correctos.
- Marca claramente cualquier supuesto que hayas tenido que asumir.

---

## Anexo A — Mensaje de arranque (arquitectura + modelo de datos)

> Pégalo junto con este documento como primer mensaje. No pide código todavía.

```text
Te paso la especificación completa de un sistema de facturación, inventario y
gestión de negocio para República Dominicana (documento adjunto). Antes de
escribir UNA SOLA LÍNEA de código, quiero que hagas solo esto:

1. ARQUITECTURA PROPUESTA: cómo encaja todo dentro del stack ya definido en la
   sección 2 (React/TypeScript compartido, tauri para escritorio Windows, PWA
   para web/móvil, SQLite local + PostgreSQL nube con sincronización local-first,
   Supabase solo para autenticacion y autorizacion; para el backend Fastify). Diagrama de capas o descripción clara de cómo fluye y
   se sincroniza la data entre modo mono y multi-caja, y cómo opera offline.
   Incluye también cómo encaja el chatbot con VISIÓN (lectura de fotos de
   facturas de compra) y el almacenamiento/sincronización de la carpeta de
   comprobantes para el contable (sección 7.6.1), considerando que el sistema
   puede operar local, en la nube o híbrido.

2. MODELO DE DATOS DEFINITIVO: toma las entidades de la sección 4 y entrégalas
   completas (tablas, campos, tipos, llaves y relaciones), listas para implementar.
   Marca lo que cambie según inventario activado/desactivado.

3. DUDAS Y DECISIONES PENDIENTES: lista todo lo que esté ambiguo o que necesites
   que yo decida antes de empezar a programar. Para cada punto, propón tu opción
   recomendada.

No implementes módulos todavía. Cuando aprobemos arquitectura y modelo de datos,
seguiremos por fases empezando por el MVP (sección 3). El módulo fiscal (NCF) lo
trabajaremos aparte y primero me explicarás el proceso.
```

---

## Anexo B — Mensaje del módulo fiscal (NCF)

> Úsalo después de aprobar arquitectura y modelo de datos. Primero pide la explicación, luego implementa.

```text
Vamos a trabajar el MÓDULO FISCAL (NCF) de la sección 6, que es el de mayor
riesgo. Antes de programarlo, primero EXPLÍCAMELO en lenguaje claro, sin código:

1. TIPOS DE NCF de la DGII relevantes para un comercio (crédito fiscal, consumo,
   regímenes especiales, gubernamental, notas de crédito/débito, etc.): qué es
   cada uno y cuándo se usa.
2. SECUENCIAS AUTORIZADAS: cómo funcionan los rangos, la numeración, el
   vencimiento y qué pasa cuando una secuencia se agota o caduca.
3. VALIDACIÓN DEL RNC/cédula del cliente: formato y reglas.
4. CÁLCULO DEL ITBIS: cómo se separa el monto gravado del impuesto y cómo se
   manejan los productos exentos.
5. MODELO DE DATOS específico para administrar NCF (encaja con el modelo general
   ya aprobado).

Cuando me expliques esos 5 puntos y yo los valide, recién ahí implementamos:
- Botón "Factura con comprobante fiscal (NCF)" en la pantalla de Ventas.
- Captura del RNC (y alta del cliente si no existe).
- Visualización de la factura con NCF separando gravado e ITBIS, marcando exentos.
- La configuración necesaria en el módulo de Configuración (cargar secuencias,
  tipos, vencimientos, datos fiscales del negocio).

Mantente dentro del stack y del modelo de datos que ya aprobamos. Si detectas algo
del proceso fiscal que yo deba decidir, propón tu opción recomendada.

IMPORTANTE: verifica las reglas vigentes de la DGII (tipos de e-CF/NCF y la
facturación electrónica obligatoria) al momento de implementarlo, porque la
normativa en RD ha ido migrando hacia el comprobante fiscal electrónico.
```
