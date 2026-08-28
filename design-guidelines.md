# Guía de diseño — facturAI (`@sfr/ui`)

Reglas de diseño visual e interacción para la UI compartida entre la PWA
(`@sfr/web`) y el escritorio Tauri (`@sfr/desktop`). Complementa a `plan.md`
(arquitectura y modelo de datos): acá va **cómo se ve y cómo se opera**, no qué
hace.

El público es un cajero o dueño de negocio en República Dominicana que factura de
pie, con prisa, muchas veces sin mouse y con la mano ocupada en el lector de
código. De ahí salen las tres reglas que mandan sobre todo lo demás:

1. **Teclado primero.** Toda tarea completa —vender, cobrar, imprimir— se hace
   sin tocar el mouse. Si un flujo nuevo no se puede terminar con el teclado, no
   está terminado.
2. **Nada bloquea la venta.** Un error de hardware, de red o de la DGII degrada a
   un camino alterno; nunca deja el ticket sin cerrar.
3. **Lo primero que cede es el cromo.** Al faltar espacio se sacrifica la
   navegación antes que el contenido.

---

## 1. Fuente de verdad de los estilos

Solo hay dos archivos donde vive el diseño. Nada de hex sueltos en pantallas.

| Archivo | Qué define |
|---|---|
| `packages/ui/src/estilos-globales.css` | Variables `--sfr-*` (temas claro/oscuro), reglas por etiqueta, `@media`, accesibilidad, animaciones |
| `packages/ui/src/estilos.ts` | Objetos `c` (colores) y `s` (componentes) que las pantallas aplican como `style={{}}` |

Las pantallas se estilizan con **objetos inline** (`style={{...s.boton}}`), no con
clases. Consecuencia obligada: `estilos.ts` **no contiene hex**, solo
`var(--sfr-…)`. Así un único atributo `data-theme` en `<html>` repinta la app
entera sin recorrer pantalla por pantalla.

Todo lo que un objeto inline no puede expresar —`@media`, `:hover`,
`:focus-visible`, pseudoelementos, scrollbars— va en `estilos-globales.css` **por
etiqueta** (`button`, `input`, `tbody tr`), no por clase, para que aplique solo
con existir.

**Al agregar un color nuevo:** se declara en `:root` *y* en `[data-theme="dark"]`,
se expone en `c`, y recién ahí se usa. Un color definido en un solo tema es un bug.

---

## 2. Color

### Acento

El acento es **rojo granate** (`#991b1b` claro / `#c1121f` oscuro). En `estilos.ts`
las claves históricas se llaman `azul`/`azulOscuro`/`azulClaro`: son **nombres de
rol, no de matiz** (primario / primario-fuerte / primario-tenue). No renombrarlos
al vuelo; y no elegir un token por su nombre sino por su rol.

### Tokens

| Rol | `c.*` | Variable | Claro | Oscuro |
|---|---|---|---|---|
| Primario | `azul` | `--sfr-acento` | `#991b1b` | `#c1121f` |
| Primario fuerte (texto sobre tenue) | `azulOscuro` | `--sfr-acento-oscuro` | `#7f1d1d` | `#fca5a5` |
| Primario tenue (fondo de selección) | `azulClaro` | `--sfr-acento-claro` | `#fef2f2` | `rgba(193,18,31,.18)` |
| Peligro | `rojo` / `rojoFondo` | `--sfr-peligro*` | `#b91c1c` | `#f87171` |
| Éxito | `verde` / `verdeFondo` | `--sfr-exito*` | `#16a34a` | `#4ade80` |
| Advertencia | `amarillo` / `amarilloFondo` | `--sfr-advertencia*` | `#92400e` | `#fbbf24` |
| Texto secundario | `gris` | `--sfr-gris` | `#6b7280` | `#9ca3af` |
| Borde | `borde` | `--sfr-borde` | `#e5e7eb` | `#303033` |
| Texto | `texto` | `--sfr-texto` | `#1f2937` | `#f4f4f5` |
| Fondo de app | `fondo` | `--sfr-fondo` | `#f8fafc` | `#0a0a0a` |
| Superficie (tarjeta, nav, modal) | `superficie` | `--sfr-superficie` | `#ffffff` | `#18181b` |

### Reglas

- **El color nunca es el único portador de información.** Un estado siempre trae
  además texto, icono o forma. Los estados fiscales (`aceptado`/`rechazado`/
  `contingencia`) y los de clasificación de compra (`con_fiscal`/`sin_fiscal`/
  `pendiente_revision`) se muestran como `s.badge` **con su etiqueta escrita**.
- **El primario tenue significa "esto es lo seleccionado"**: fila resaltada en
  catálogos, módulo activo en la barra lateral. No se usa de fondo decorativo.
- **El rojo se reserva para destruir o para fallar.** Anular, eliminar, devolver,
  error de emisión. Un monto negativo no es rojo por ser negativo.
- **El tema por defecto es oscuro** (`useTema`), persistido en `localStorage` bajo
  `sfr_tema`. Ambos temas son de primera clase: nada se diseña "para claro y que
  se vea aceptable en oscuro".
- En oscuro el `:hover` de botón **aclara** (`brightness(1.15)`) en vez de
  oscurecer (`0.96`), porque oscurecer sobre `#18181b` no se percibe.

---

## 3. Tipografía

- **Inter Variable**, autoalojada vía `@fontsource-variable/inter` — un POS tiene
  que verse igual sin internet. Nunca cargar fuentes por CDN.
- Fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- Pesos en uso: **400** cuerpo, **500** etiquetas y botones secundarios, **600**
  botones primarios / encabezados de tabla / badges, **700** solo la marca.

| Uso | Tamaño | Notas |
|---|---|---|
| Título de módulo (`h2`) | 22 (18 en móvil) | `letterSpacing: -0.3` |
| Título de modal (`h3`) | 18 | |
| Mensaje de modal | 15 | `lineHeight: 1.5` |
| Cuerpo, tabla, input, botón | 14 | |
| Etiqueta de campo, metadatos | 13 | color `c.gris` |
| `th`, badge, pista de atajo | 11–12 | `th` en mayúsculas, `letterSpacing: 0.4` |

**Montos:** siempre `money()` de `estilos.ts` (`1,600.00`, separador de miles, dos
decimales) y en columna a la derecha con `fontVariantNumeric: "tabular-nums"`
(`s.tdDerecha`), para que los montos se comparen de un vistazo. `money()` es
**solo para mostrar**: nunca en el `value` de un `<input type="number">` ni en un
CSV/Excel exportado — ahí el número va plano.

Prefijo de moneda `RD$` con espacio: `RD$ 1,600.00`.

---

## 4. Forma, espacio y elevación

- **Radios:** 8 (botón, input, item de nav), 12 (tarjeta), 16 (modal), 999 (badge,
  píldora, botón circular).
- **Espaciado** en múltiplos de 2 con 8 como unidad de trabajo: `gap` 6/8/10/16,
  padding de tarjeta 18, `main` 24×32 (12×14 en compacto/móvil).
- **Sombras** — solo dos, en `sombra`:
  - `sm` (`0 1px 2px rgba(15,23,42,.06)`): tarjetas y botones primarios.
  - `md`: modales, cajón de navegación.

  No inventar una tercera. La jerarquía se construye con borde y superficie, no
  con desenfoque.
- **Bordes:** `1px solid c.borde` en todo lo que sea contenedor. El acento de
  estado va como **borde grueso de un lado**: `borderTop: 5px` en modales,
  `borderLeft: 4px` en `s.errorBox`, `borderLeft: 3px` en el item de nav activo
  (transparente cuando no está activo, para que nada se mueva al seleccionar).

### Capas (`zIndex`)

| Capa | Valor |
|---|---|
| Sticky dentro de la pantalla (encabezado de tabla, resultados de búsqueda) | 20 |
| Modales de pantalla y burbuja del chatbot | 100 |
| Modal encima de otro modal (`ModalConfirmarCambios`) | 150 |
| Fondo del cajón / cajón de navegación | 290 / 300 |
| Enlace "saltar al contenido" | 400 |
| `confirmar()` / `avisar()` / `elegir()` — siempre lo más alto | 500 |

Un modal nuevo entra en 100 salvo que tenga que aparecer sobre otro.

---

## 5. Componentes

Se toman de `s`. Si algo se estiliza a mano tres veces, se promueve a `s`.

| Token | Cuándo |
|---|---|
| `s.boton` | Acción primaria. Relleno acento, texto blanco, 600. Uno solo por contexto. |
| `s.botonSecundario` | Cancelar, alternar, acciones de fila. Superficie + borde. |
| `s.botonPeligro` | Eliminar/anular en fila: contorno rojo sobre superficie, más compacto (6×12). En un modal de confirmación el botón destructivo sí va **sólido** rojo. |
| `s.input` | Input, select y textarea — el mismo token para los tres, así una fila de campos queda pareja. |
| `s.label` | Etiqueta sobre el campo, 13px gris. Los obligatorios se marcan con ` *` en el texto. |
| `s.tabla` / `s.th` / `s.td` / `s.tdDerecha` | Tablas. `tdDerecha` para todo lo numérico. |
| `s.filaVacia` | Estado vacío dentro de la tabla: centrado, 36px de aire, y **dice qué hacer** ("Sin clientes. Crea el primero con '+ Nuevo cliente'."). |
| `s.badge` | Píldora para estados y categorías cortas. |
| `s.tarjeta` | Contenedor de sección; base también de los modales. |
| `s.formFooter` | Barra de acciones al pie de un formulario: línea superior, `gap: 8`, primario a la izquierda. |
| `s.errorBox` | Error de validación en línea, dentro del formulario. Lleva `role="alert"`. |

### Anatomía de una pantalla de catálogo

Productos, Clientes y Promociones comparten la misma estructura, y una pantalla
nueva debería copiarla:

```
[ + Nuevo (F6) ]  [ búsqueda… (F10) ]  «N registro(s)»     ← barra de acciones, gap 8

┌─ s.tarjeta ──────────────────────────────────────────┐   ← formulario (solo si está activo)
│ h3 con icono   ·   grid 1fr 1fr, gap 12              │
│ s.errorBox si hay validación fallida                 │
│ s.formFooter: Guardar (Ctrl+S) · Cancelar (Esc)      │
└──────────────────────────────────────────────────────┘

┌─ s.tarjeta > .sfr-tabla-scroll > table ──────────────┐   ← listado
└──────────────────────────────────────────────────────┘
```

- El buscador se autoenfoca al entrar y tiene `maxWidth: 320`.
- El contador de registros va a la derecha del buscador, 13px gris.
- Toda tabla ancha va envuelta en `.sfr-tabla-scroll` para desplazarse dentro de
  su caja en vez de estirar la página.

### Diálogos

- **Nunca** `alert()`, `confirm()` ni `prompt()` nativos: en la ventana de Tauri
  (WebView2 sin cromo de navegador) son fáciles de pasar por alto y no se pueden
  estilizar. Se usa `useAlertas()`: `confirmar()`, `avisar()`, `elegir()`.
- `confirmar()` es **destructivo por defecto** (`peligro: true`), porque casi todo
  uso es "¿Eliminar X?". Pasar `peligro: false` para lo demás.
- Estructura fija: borde superior de 5px con el color del estado, icono en círculo
  de 40px, título, mensaje, y pie con las acciones a la derecha.
- El texto del botón **lleva su tecla entre paréntesis**: `Confirmar (Enter)`,
  `Cancelar (Esc)`.
- Todo modal: `role="dialog"` (o `alertdialog` si interrumpe) + `aria-modal="true"`
  + `aria-labelledby` al título, y el ref de `useModalAccesible()` — que atrapa el
  Tab dentro y devuelve el foco al elemento que lo abrió al cerrar.
- Tamaño: `width` fijo (440–460) con `maxWidth: 90vw` y `maxHeight: 90dvh` con
  `overflow: auto`, para que un mensaje largo no empuje los botones fuera de la
  pantalla en teléfono.
- Clic en el fondo y `Esc` cancelan. El botón principal se enfoca al abrir.

### Iconos

`lucide-react`, siempre con `aria-hidden="true"` (el nombre accesible va en el
texto o en `aria-label`). Tamaños: **16** en línea con texto de 14, **18** en
títulos de tarjeta, **20–22** en título de módulo e iconos de modal, **14** en
controles compactos.

---

## 6. Layout y responsive

La app se estiliza inline, así que el responsive **se decide en JS**
(`hooks/useBreakpoint.ts`), no con `@media`. Cuatro tramos:

| Tramo | Ancho | Barra lateral | Contenido |
|---|---|---|---|
| `amplio` | ≥1100 | completa (216px) | dos columnas |
| `medio` | 940–1099 | tira de iconos (60px) | dos columnas |
| `compacto` | 700–939 | tira de iconos | apilado |
| `movil` | <700 | cajón con hamburguesa | apilado |

Los cortes salen de anchos reales de Ventas, la pantalla más exigente:
barra + padding del `main` (64) + Totales (280) + gap (16) + ~520 de la lista del
ticket. El **orden en que las cosas ceden es deliberado**: primero la barra
lateral pierde etiquetas, después el contenido se apila, y recién en teléfono la
barra sale del flujo.

Hooks a usar en vez de leer el ancho a mano: `useEsAngosto()` (¿apilar?),
`useNavSoloIconos()`, `useNavEnCajon()`, `useEsMovil()`, `useEsTactil()`.

- Se escucha `matchMedia`, no `resize`: el navegador avisa al **cruzar** el
  límite, así arrastrar la ventana no dispara un render por frame.
- `height: 100dvh` (no `vh`): en el navegador del teléfono la barra de direcciones
  aparece y desaparece al scrollear.
- Todo hijo flex que deba encogerse necesita `minWidth: 0` — sin eso el `<main>`
  se niega a bajar del ancho de su contenido y la columna de Totales queda cortada
  antes de que llegue el breakpoint.

### Táctil ≠ angosto

Se pregunta por el **puntero**, no por el ancho: una tablet mide 800–1100px pero
se maneja con el dedo, y una ventana de escritorio achicada a 600px sigue teniendo
mouse y teclado. Bajo `@media (pointer: coarse)`:

- Campos a `16px` obligatorio — con menos, iOS hace zoom al enfocar y deja la
  página descuadrada.
- `min-height: 44px` en botones (objetivo táctil mínimo). Los steppers `−/+` y los
  iconos cuadrados se eximen con `.sfr-boton-compacto`.
- Bajo `@media (hover: none)` se anula el `:hover` de fila: en táctil se queda
  "pegado" después de tocar y deja filas resaltadas de mentira.
- Las pistas de atajo se quitan del texto del botón con `sinAtajo(texto, esTactil)`:
  "Cobrar (F12)" → "Cobrar". No se anuncia una tecla que no existe.

---

## 7. Teclado

Es la característica más importante del producto, no un extra de accesibilidad.

### Convenciones globales

| Tecla | Significado |
|---|---|
| `Alt+1…9` | Ir al módulo N (desde cualquier lugar) |
| `F6` | Nuevo registro / nuevo ticket |
| `F10` | Enfocar la búsqueda |
| `Ctrl+S` | Guardar el formulario abierto |
| `Ctrl+P` | Imprimir / reimprimir lo seleccionado |
| `Ctrl+E` | Exportar (Reportes) |
| `Esc` | Cerrar modal, cancelar formulario, cerrar cajón |
| `Enter` | Acción primaria del contexto |
| `Supr` | Eliminar la fila resaltada |
| `↑ ↓` | Mover el foco entre campos / mover la fila resaltada |
| `← →` | Recorrer las acciones de la fila resaltada |

En Ventas, además: `F5` cotizar, `F7` producto suelto, `F8` mayoreo, `F9` consulta
de precio, `F12` cobrar, `Insert` cantidad específica, `+`/`-` cantidad de la línea
resaltada, `Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z` deshacer y rehacer (se registran las
dos convenciones de rehacer porque ambas son comunes en Windows).

### Reglas al agregar atajos

- **La tecla se escribe en el botón**: `Guardar (Ctrl+S)`, `+ Nuevo cliente (F6)`.
  Un atajo que no se ve no existe. En la barra lateral la pista va en el `title` y
  como número tenue con `aria-hidden` (un "1" leído en voz alta no significa nada).
- `useAtajosTeclado(mapa, activo)` hace `preventDefault()` **antes** de mirar si
  hay algo que hacer. Por eso **una tecla que se escribe** (`+`, `-`, `Supr`) solo
  puede entrar al mapa si es condicional al contexto, o mejor: se maneja con su
  propio listener que decide antes de bloquear nada. Si no, esa tecla deja de
  poderse teclear en toda la pantalla.
- El mapa de la pantalla se desactiva (`activo = false`) mientras haya un modal
  abierto que use las mismas teclas.
- `↑`/`↓` **mueven el foco, no cambian el valor** (`useNavegacionFlechas`): en un
  POS las flechas sirven para pasar de campo, y el comportamiento nativo de
  `<input type="number">` de alterar cantidades o precios es justo lo que no se
  quiere. Se intercepta solo en `<input>`: en `<textarea>` y `<select>` el
  comportamiento nativo es el correcto y no se toca.
- En listados: `↑↓` mueve la fila, `←→` recorre sus acciones con "fila" como
  posición de reposo, `Enter` dispara la acción resaltada. La aritmética vive en
  `utilidades/navegacionFilas.ts` — no reimplementar los `Math.min/max`.
- La acción resaltada se marca con `outline: 2px solid c.azul` + `outlineOffset: 1`,
  y la fila con fondo `c.azulClaro`; la fila se mantiene a la vista con
  `scrollIntoView({ block: "nearest" })`.
- En Ventas, teclear en cualquier parte de la pantalla arranca la búsqueda de
  productos (type-ahead), salvo que el foco ya esté en otro campo de texto.

---

## 8. Accesibilidad

Piso no negociable de cada pantalla:

- **`.sfr-salto-contenido`** como primer tabulador: sin él, quien navega con
  teclado pasa por los nueve módulos en *cada* pantalla antes de llegar a lo suyo.
- **`:focus-visible` siempre visible**: contorno de 2px en acento con offset 2 en
  botones; borde acento + halo de 3px (`--sfr-sombra-focus`) en campos.
  `:focus-visible` y no `:focus`, para que el anillo aparezca al navegar con
  teclado pero no al hacer clic con el mouse.
- **Botón solo con icono ⇒ `aria-label`**. El `title` sale como tooltip pero no
  todos los lectores de pantalla lo anuncian.
- `aria-current="page"` en el módulo activo; `aria-pressed` en alternadores;
  `aria-expanded` en el botón del cajón.
- Al abrir el cajón el foco entra en él; al cerrarlo vuelve al botón que lo abrió.
- Los errores de validación van en `role="alert"`.
- `.sfr-solo-lector` para texto que se lee pero no se ve.
- `@media (prefers-reduced-motion: reduce)` anula animaciones y transiciones: las
  entradas de modal pueden marear a personas con trastornos vestibulares.
- Movimiento: 80–150ms y nada más. `120ms` en botones, `150ms` en el cambio de
  tema, `~140ms` con `cubic-bezier(.2,.8,.3,1.1)` en la entrada de modal — un
  "pop" corto para que sea imposible no notarlo, sin sentirse brusco.

---

## 9. Impresión

El recibo es parte del producto y tiene sus propias reglas, distintas a las de
pantalla:

- **Monoespaciada** (`Courier New`), 16px, `line-height 1.4`. Nada de Inter: el
  recibo se alinea por columnas de caracteres.
- Ancho de página según `negocio.ancho_impresora_default`: **58mm u 80mm**,
  `@page { size: <ancho> auto; margin: 2mm }`. En texto plano, 46 columnas.
- **Sin color y sin fondos.** Los separadores son `hr` punteados; el énfasis es
  negrita y tamaño (el TOTAL a 20px en negrita).
- Estructura fija: negocio y RNC centrados → ticket, fecha y cliente → NCF y tipo
  de e-CF centrados si es fiscal → líneas → gravado/exento/ITBIS/TOTAL →
  pagos/pagado/cambio → notas → cierre.
- Las cantidades se redondean antes de imprimir: el recibo nunca muestra
  `3.3333333333333335`.
- **Cadena de degradación** (§ `impresion/recibo.ts`), y ningún eslabón puede
  bloquear el cierre de la venta: térmica ESC/POS directa → texto plano por GDI →
  HTML en iframe + `window.print()`.

---

## 10. Texto de interfaz

- **Todo en español dominicano**, tuteando ("¿Estás seguro?"). Los identificadores
  del código también van en español (`s.botonPeligro`, `useAtajosTeclado`) para no
  mezclar idiomas dentro de un archivo.
- Vocabulario del negocio, no de la programación: *ticket*, *cobrar*, *anular*,
  *corte de caja*, *mayoreo*, *suelto*, *comprobante*, *ITBIS*, *NCF*. Se dice
  "Anular" —no "Eliminar"— cuando la factura queda en la bitácora.
- **Fecha y hora con locale `es-DO`**; montos con `en-US` a propósito, porque la
  convención dominicana usa coma de miles y punto decimal (`1,600.00`).
- Botones en infinitivo (`Guardar`, `Cobrar`, `Imprimir`), con la tecla al final
  entre paréntesis.
- Los estados vacíos dicen el siguiente paso, no solo que no hay nada.
- Los mensajes de error dicen qué pasó y qué hacer; el detalle técnico, si lo hay,
  va en el modal de aviso, nunca solo en la consola.
- Toda acción que crea, cobra, modifica o elimina —y **toda** acción sugerida por
  el chatbot— pasa por confirmación explícita antes de ejecutarse, y queda en
  `bitacora_accion`.

---

## 11. La marca

La silueta **es** un recibo: formato vertical, un renglón y el borde inferior
rasgado. La antena y los dos ojos la vuelven además una cara, con el renglón
haciendo de boca — un objeto con dos lecturas, en vez de un dibujo con varios
objetos. A 16 px queda el recibo; a 128 px aparece el robot.

Dos formas, y no son intercambiables:

- **La marca sola** (`brand/marca.svg`, o `<Marca size={20} />` de `@sfr/ui`) va
  **dentro** de la app. Se pinta con `currentColor`, así que hereda el tema como
  cualquier ícono de lucide: `#991b1b` en claro, `#c1121f` en oscuro.
- **La ficha** (`brand/marca-ficha.svg`) —la marca calada en blanco sobre un
  cuadrado redondeado garnet— va **fuera**: favicon, barra de tareas,
  instalador, ficha de la PWA. Una marca transparente y delgada se pierde en la
  barra de tareas; una ficha no. Siempre en `#991b1b`, el mismo garnet que ya
  declaran el `theme_color` del manifest y el `index.html`.

Reglas que la mantienen usable:

- **Un tono plano.** Ni degradados, ni sombras, ni líneas finas: tiene que pasar
  la cabecera térmica de 1 bit (§9) sin cambiar nada.
- **Los huecos son huecos** (`fill-rule="evenodd"`), no formas del color del
  fondo — así se ve bien sobre cualquier superficie.
- **El `maskable` de Android es un archivo aparte**, no un propósito extra del
  mismo icono: el recorte adaptativo le comería la antena y el rasgado.
- **Nada de una marca "para claro" y otra "para oscuro".** Es una sola figura;
  lo que cambia es el color que hereda.

La mascota —el robot completo, imprimiendo un recibo por una ranura del pecho—
es una figura **secundaria**: splash y burbuja del chatbot. Nunca a 16 px, nunca
como favicon. Una marca tiene que sobrevivir un tamaño diminuto en un color; una
mascota tiene que tener carácter. Son trabajos distintos.

Los binarios (22 PNG/ICO) se regeneran con `node brand/generar-iconos.mjs`, que
verifica cada archivo píxel a píxel. Detalles y advertencias en `brand/README.md`.

> **No confundir con el logo del negocio.** `negocio.logo_ruta` es el logo del
> negocio que factura, y es el que se imprime en el recibo de su cliente. Esta
> marca es la de la aplicación.

---

## 12. Checklist para una pantalla nueva

- [ ] Usa `s`/`c`; ningún hex propio, ningún color fuera de las variables `--sfr-*`.
- [ ] Se ve correcta en tema claro **y** oscuro.
- [ ] `F6` crea, `F10` busca, `Ctrl+S` guarda, `Esc` cancela — y cada tecla está
      escrita en su botón.
- [ ] El listado se recorre con `↑↓`, sus acciones con `←→`, y `Enter` las dispara.
- [ ] Los cuatro tramos de ancho funcionan; las tablas van en `.sfr-tabla-scroll`.
- [ ] Con `pointer: coarse` los objetivos llegan a 44px y las pistas de atajo
      desaparecen (`sinAtajo`).
- [ ] Los modales usan `useModalAccesible()` + `role`/`aria-modal`/`aria-labelledby`.
- [ ] Nada de `alert()`/`confirm()`: se usa `useAlertas()`.
- [ ] Los montos pasan por `money()` y van en `s.tdDerecha`.
- [ ] Estado vacío con `s.filaVacia` y con instrucción.
- [ ] Errores de validación en `s.errorBox` con `role="alert"`.
- [ ] Ningún fallo (impresión, red, DGII) deja una venta a medio cerrar.
- [ ] Si la pantalla muestra la marca, usa `<Marca />` — no una copia del SVG
      ni un ícono de lucide en su lugar.
