# Cambios desde la última publicación

Resumen de todo lo que entró entre `a60cae1` (lo último que estaba en GitHub) y `d871060`.
**76 archivos, +3298 / −453.** Cuatro commits:

| Commit | Qué trae |
|---|---|
| `7b93a77` | Iconos Lucide, navegación por teclado en listas, arreglos de impresión y reportes |
| `644f91a` | Marca facturAI, juego de iconos y guía de diseño |
| `e7b4f44` | Tramos responsive, trato táctil y accesibilidad de modales |
| `d871060` | Renombrado del producto a facturAI y marca en el cascarón |

---

## 1. Pantalla de Ventas

**Barra de herramientas reducida de 6 controles a 3.** Salieron el botón de mayoreo (ahora vive en
cada línea), el de voz y el de "Agregar cantidad". Quedaron `+ No registrado (F7)` y `Consultar (F9)`,
más un chip que solo aparece cuando el modo mayoreo global está activo — sin él ese modo quedaba
encendido sin nada en pantalla que lo delatara.

**Mayoreo por línea.** Cada línea del ticket tiene su propio interruptor `mayoreo`. F8 conserva sus
dos significados: con una línea resaltada alterna ESA línea; sin ninguna, cambia el régimen del
próximo producto que se agregue.

**Cantidad siempre editable.** El campo de cantidad ya no exige un clic previo para aparecer. En
líneas a granel se agrega un segundo campo de **monto en RD$** que calcula la cantidad sola
("RD$100 de arroz").

> La ventanita de cantidad (Insert) NO se eliminó: sigue abriéndose sola al elegir un producto a
> granel, y es el único lugar donde un monto se convierte en peso.

**Nuevos atajos.** `F4` salta al cliente del ticket (si ya hay uno asignado, enfoca "Quitar", que es
el camino para cambiarlo). `Supr` borra la línea resaltada, con la misma confirmación que el botón.
El atajo de "Agregar cantidad" pasó de `F11` a `Insert`.

**Enter crea el cliente** en el formulario rápido de "+ Nuevo", sin tener que ir hasta el botón.

## 2. Apariencia

**Colisión de colores corregida.** El acento de la marca (`#991b1b`) y el color de peligro
(`#b91c1c`) tenían fondos claros **idénticos** (`#fef2f2`): una fila seleccionada se veía igual que
un cuadro de error. Se agregó `--sfr-seleccion`, neutro, para resaltados; peligro tiene su propio
tinte; y los botones destructivos son neutros en reposo y solo se ponen rojos al apuntarlos.

**El anillo de foco dejó de ser rojo.** Un campo simplemente enfocado se leía como un campo
inválido. Ahora es neutro (`--sfr-foco`), claramente distinto del estado de error.

**Jerarquía.** La búsqueda salió de su tarjeta y va sobre el fondo de la página; la lista del ticket
es la única superficie con relieve y se estira hasta abajo (antes quedaba flotando con media
pantalla vacía); Cliente quedó discreto para que Totales pese en su columna.

**Tabla más legible.** Filas de 10px → 13px de padding, cifras de ancho fijo en todas las celdas
(los dígitos no se alinean sin eso), subtotal más grande y en semibold, anchos de columna explícitos
— "Cant." se estiraba tanto que dejaba el − y el + en extremos opuestos.

**Menos ruido por fila.** −/cantidad/+ pasaron a ser un solo control segmentado; "Borrar" es un
icono que aparece al pasar por la fila (sigue alcanzable con Tab y con Supr); el interruptor de
mayoreo se esconde hasta que se pasa por encima, salvo cuando está activo.

**Atajos como chips.** `Cobrar ⌜F12⌝` en vez de `Cobrar (F12)` (§ `EtiquetaAtajo`).

**Emojis reemplazados por iconos Lucide** en toda la app.

## 3. Responsive y móvil

Nuevo `useBreakpoint` con cuatro tramos. **Lo primero que cede siempre es la barra lateral**, y solo
después se toca el contenido:

| Ancho | Barra lateral | Contenido |
|---|---|---|
| ≥1100 | completa (216px) | dos columnas |
| 940–1099 | tira de iconos | dos columnas |
| 700–939 | tira de iconos | apilado |
| <700 | cajón (hamburguesa) | apilado |

Por encima de 1100px cada rama devuelve el layout de siempre: **la app de escritorio no cambió**.

**Bug de layout corregido:** `<main>` es un hijo flex sin `minWidth: 0`, así que se negaba a
achicarse por debajo del ancho de su contenido. Con la barra lateral en `flexShrink: 0`, al angostar
la ventana nada cedía y la columna de Totales quedaba cortada por la mitad. Mismo arreglo
(`minmax(0, 1fr)`) en las grillas de Ventas, Facturas y Cotizaciones.

**Trato táctil por tipo de puntero, no por ancho** (`(pointer: coarse)`): una tablet es ancha pero se
maneja con el dedo. Campos a 16px (evita el zoom automático de iOS), objetivos de 44px, sin
autoFocus que abra el teclado al entrar, y toque para resaltar — con solo `onMouseEnter`, en pantalla
táctil F8 y +/− se quedaban sin línea sobre la cual actuar.

**PWA instalable:** iconos PNG 192/512 + maskable, `apple-touch-icon`, meta de iOS, color de tema
corregido (estaba azul, la app es roja), `navigator.storage.persist()` para que el teléfono no
descarte la base, y volcado de la base al pasar a segundo plano (antes se perdían los últimos
150 ms de escrituras si el sistema mataba la pestaña).

## 4. Accesibilidad

- Enlace "saltar al contenido"; `<nav>` con `aria-current` en el módulo abierto.
- Modales con `role="dialog"`/`alertdialog`, trampa de foco y devolución del foco al cerrar
  (`useModalAccesible`).
- La búsqueda de productos es un combobox real (`listbox` + `aria-activedescendant`).
- Los 17 cuadros de error anuncian con `role="alert"`; el cambio en Cobrar se anuncia en vivo.
- `aria-label` en botones que son solo icono; `scope="col"` en los 70 encabezados de tabla.
- Anillo de foco visible (`:focus-visible`) y respeto por `prefers-reduced-motion`.

> **Pendiente:** en las pantallas de administración las etiquetas `<label>` todavía no están atadas
> a sus campos (`htmlFor`/`id`), así que un lector de pantalla no anuncia esos nombres. Falta también
> verificar contraste de color.

## 5. Correcciones de datos e impresión

**Ganancia estimada.** El cálculo ignoraba en silencio el costo de las líneas vendidas sin producto
vinculado, inflando la ganancia. Se agregó `ingresosSinCosto` y un aviso en Reportes que dice
cuánto ingreso no tiene costo conocido, en vez de mostrar un número optimista sin explicación.
(El comportamiento del cálculo se mantuvo: estaba documentado y cubierto por tests a propósito.)

**Códigos de barra con cero inicial.** El importador CSV convertía a número cualquier cadena de
dígitos, y `Number("0123456789012")` se come el cero. El código quedaba guardado mal y después el
escáner no lo encontraba. Ahora un entero con cero a la izquierda se mantiene como texto.

**Reimpresión pregunta primero** entre "Imprimir" y "Guardar PDF", en vez de mandar a la impresora
de una (§ nueva primitiva `elegir()` en `Alertas`).

**Cotizaciones por impresora térmica** (ESC/POS), que antes solo salían por PDF/navegador.

**Cantidades a 2 decimales** en pantalla y en los impresos (antes 4). Solo presentación: el valor
guardado conserva su precisión.

**Confirmación al bajar una cantidad a cero**, que borraba la línea en silencio.

## 6. Marca

Marca facturAI propia (`brand/`), juego de iconos generado por script para escritorio y PWA,
`design-guidelines.md`, y renombrado del producto de "Sistema de Facturación" a **facturAI**.

> El identificador del bundle **no cambió** (`do.facturacion.sistema`), así que la base de datos
> sigue en la misma carpeta: actualizar no pierde datos.

---

## Verificación

- `pnpm --filter @sfr/core test` — 144/144 en verde.
- `typecheck` limpio en `@sfr/core`, `@sfr/ui`, `@sfr/desktop` y `@sfr/web`.
- Instalador de escritorio construido e instalado.

**Sin verificar visualmente en navegador:** la extensión de Chrome no estuvo disponible en esta
sesión, así que el responsive se revisó por código y con una captura de pantalla, no arrastrando la
ventana. Vale la pena confirmar a mano el orden de colapso y las pantallas en el teléfono.
