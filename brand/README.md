# Marca

Los maestros de la marca. Todo lo demás —los 22 PNG/ICO del instalador y de la
PWA— se genera desde acá; no se editan a mano.

| Archivo | Qué es |
|---|---|
| `marca.svg` | La marca sola, en garnet sobre transparente. Para documentación y prensa. Su gemelo en React es `<Marca />` de `@sfr/ui`. |
| `marca-ficha.svg` | La ficha: la marca calada en blanco sobre un cuadrado redondeado garnet. Es la forma que usan el favicon, el icono de Windows y el de la PWA. |
| `marca-ficha-maskable.svg` | La ficha sin esquinas y con la marca encogida dentro de la zona segura, para el icono `maskable` de Android. |
| `generar-iconos.mjs` | Regenera todos los binarios desde los tres SVG. |

## La figura

La silueta **es** un recibo: formato vertical, un renglón y el borde inferior
rasgado. La antena y los dos ojos la vuelven además una cara, con el renglón
haciendo de boca — un objeto con dos lecturas, en vez de un dibujo con varios
objetos. A 16 px queda el recibo; a 128 px aparece el robot.

Reglas que la mantienen usable:

- **Un tono plano.** Sin degradados, sin sombras, sin líneas finas. La cabecera
  térmica imprime a 1 bit y ~460 puntos de ancho; cualquier otra cosa se vuelve
  un borrón.
- **Los huecos son huecos.** Ojos y boca se calan con `fill-rule="evenodd"`, no
  se pintan del color del fondo, así la marca se ve bien sobre cualquier
  superficie.
- **Dentro de la app va con `currentColor`** y hereda el tema (`#991b1b` claro,
  `#c1121f` oscuro). **Fuera de la app va la ficha**, siempre en `#991b1b`: una
  marca transparente y delgada se pierde en la barra de tareas, y el garnet de
  la ficha es el mismo `theme_color` que ya declaran el manifest y el
  `index.html`.

## Regenerar los binarios

```bash
node brand/generar-iconos.mjs
```

Rasteriza con Edge o Chrome en modo headless —ya están en cualquier Windows— en
vez de sumarle al monorepo una dependencia de imagen con binarios nativos que
sólo haría falta para esto. Si no encuentra ninguno, apuntá `CHROME_PATH` al
ejecutable.

**Cada archivo se decodifica y se le cuentan los píxeles antes de darlo por
bueno.** No es de más: el navegador headless devuelve exit 0 y un PNG del tamaño
correcto aunque haya capturado la página a medio pintar. En la primera
generación se colaron cuatro iconos completamente en blanco y uno pintado a la
mitad, y todos parecían correctos desde afuera. El script ahora verifica que
haya tinta en ~97 % del cuadro y que la marca calada ocupe su ~15 % en blanco, y
reintenta hasta tres veces antes de fallar.

Escribe:

- `packages/desktop/src-tauri/icons/` — `32x32`, `64x64`, `128x128`,
  `128x128@2x`, `icon.png`, los nueve `Square*Logo`/`StoreLogo` del empaquetado
  MSIX, y `icon.ico` con siete tamaños dentro (16 a 256).
- `packages/web/public/` — `icon.svg`, `icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png` y `apple-touch-icon.png`.

Lo que **no** toca: `icon.icns` (macOS, que no es plataforma objetivo) ni
`icons/android/` e `icons/ios/`, que siguen con los iconos de la plantilla de
Tauri porque el proyecto todavía no empaqueta para móvil.

## Si cambia la figura

Hay que tocar **dos** lugares y volver a generar:

1. Los tres SVG de esta carpeta.
2. `packages/ui/src/componentes/Marca.tsx`, que lleva su propia copia del path
   para no depender de un archivo en tiempo de ejecución.

Después, `node brand/generar-iconos.mjs`.

## El logo del negocio no es este

`negocio.logo_ruta` guarda el logo **del negocio que factura**, y es el que sale
impreso en el recibo de un cliente. Esta marca es la de la aplicación. No se
mezclan: un colmado no quiere nuestro logo en su factura.
