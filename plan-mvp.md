# Plan de fases — MVP (Fase 1)

> Sistema de facturación, inventario y gestión (República Dominicana).
> Este documento detalla **solo el MVP**. El diseño general y el modelo de datos completo viven en `plan.md`.
> Stack confirmado: **Tauri** (escritorio) + **PWA** (web/móvil), **SQLite local**, **Fastify** y **Supabase (solo Auth)** entran en Fase 2.

## Criterios que el MVP debe cumplir (referencia)

Del prompt (§3, §5, §7, §11) y `plan.md` (Fase 1):

- **Módulos:** Ventas → Cobro → Productos (nuevo/modificar/eliminar) → Clientes básicos → Configuración mínima.
- **100% local sobre SQLite, offline**, sin fiscal, sin inventario, sin nube.
- **Reglas §5:** código de barra opcional; venta sin existencia permitida (modo sin inventario); precio = `costo + %ganancia` **o manual (manual manda)**; redondeo a 2 decimales y **cambio al centavo más cercano**; validaciones (RNC, correo, campos obligatorios).
- **§11:** cada fase entrega código funcional + cómo probarlo; reglas de §5 sin inconsistencias; supuestos marcados.

---

## Fase 0 — Andamiaje

**Objetivo:** base técnica que levanta, sin lógica de negocio.

**Entregables:** monorepo pnpm (`ui`, `core`, `desktop`/Tauri, `web`/PWA); SQLite + migraciones; tablas del MVP (`negocio`, `usuario`, `caja`, `departamento`, `producto`, `cliente`, `factura`, `factura_linea`, `pago`); seeds de ejemplo.

**Criterio de aceptación:** `pnpm dev:desktop` (Tauri) y `pnpm dev:web` (PWA) abren una ventana vacía; las migraciones aplican limpio y los seeds cargan.

## Fase 1.1 — Núcleo de dominio (`core`, sin UI)

**Objetivo:** toda la lógica de §5 aislada y testeada **antes** de tocar pantallas (aquí es donde se previenen los bugs de plata).

**Entregables:**

- Cálculo de precio: `costo + %ganancia`, con **override manual que manda**.
- Redondeo a 2 decimales y **cambio al centavo más cercano**.
- Cálculo de subtotales/total de factura.
- Pago mixto (varias filas de pago por factura).
- Repos SQLite agnósticos para producto / cliente / factura.

**Criterio de aceptación (§11):** suite de **tests unitarios** verde para precio (costo+% y manual), redondeo, cambio y pago mixto. Sin UI todavía.

## Fase 1.2 — Productos, Clientes y Configuración mínima

**Objetivo:** cubrir §7.4, §7.3 y la config que el MVP necesita.

**Entregables:**

- **Productos:** Nuevo / Modificar / Eliminar; búsqueda por código o manual; departamentos; campos del modelo (código opcional, tipo de venta, costo, %ganancia, precio venta, precio mayoreo, ITBIS/exento).
- **Clientes básicos:** alta/edición/lista con **buscador** (nombre, teléfono, correo, dirección, comentarios, aplica crédito, RNC opcional).
- **Configuración mínima:** datos del negocio, ancho de impresora (58/80), redondeo.
- **Validaciones:** RNC con formato válido, correo válido, obligatorios por pantalla.

**Criterio de aceptación:** crear/editar/borrar producto y cliente persisten en SQLite; búsqueda funciona; validaciones bloquean datos inválidos con mensaje claro.

## Fase 1.3 — Ventas (pantalla principal §7.1)

**Objetivo:** armar el ticket.

**Entregables:**

- Agregar por **código de barra** o **búsqueda manual** (al instante, §9).
- Preview: descripción, código, cantidad, precio, subtotal, total.
- Facturar por cantidad; sumar/restar; **artículo no registrado**; **precio mayoreo**; borrar línea; **verificar precio**.
- **Múltiples tickets abiertos**, dejar abierto / eliminar ticket; **asignar cliente** (con alta rápida); fecha/hora en pantalla.

**Criterio de aceptación:** se construye un ticket con productos registrados y no registrados, se cambia cantidad y precio mayoreo, y los totales cuadran con el `core`.

## Fase 1.4 — Cobro + Impresión (§7.2)

**Objetivo:** cerrar la venta.

**Entregables:**

- Ventana de cobro: total, total de artículos, método (efectivo / transferencia / crédito / tarjeta / **mixto**), monto pagado y **cambio**.
- Acciones: **Cobrar e imprimir**, **Cobrar sin imprimir**, **Cancelar (Esc)**, **Notas**.
- Impresión: **ESC/POS en Tauri** (autodetección 58/80) + **fallback a PDF** en PWA.
- **Reimprimir último ticket**.

**Criterio de aceptación (§11, prueba end-to-end):** escanear → cobrar con pago mixto → imprimir; el ticket queda `cobrada` en SQLite con su cambio correcto al centavo; reimpresión reproduce el último.

---

## Definición de "MVP terminado"

Un cajero puede, **100% offline**: registrar/editar productos y clientes, armar un ticket (con o sin código de barra, con artículos no registrados, precio mayoreo), cobrar con pago mixto, ver el cambio correcto e imprimir (POS o PDF) — cumpliendo todas las reglas de §5 sin inconsistencias.

**Fuera de alcance del MVP:** NCF/e-CF, inventario, compras, corte de caja, chatbot, nube/sync (todo eso es Fase 2+).

## Supuestos marcados (§11)

1. El MVP corre en **modo sin inventario**: `existencia` no se valida y se puede vender siempre.
2. "Configuración mínima" = datos del negocio + impresora + redondeo; permisos/roles se activan en Fase 2 (multiusuario).
3. La **sugerencia de precio por búsqueda web** (§5) se pospone a Fase 3 (necesita IA/red); en el MVP el precio es costo+% o manual.
