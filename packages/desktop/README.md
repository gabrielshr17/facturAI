# @sfr/desktop (Tauri)

Shell de escritorio Windows. Envuelve la UI compartida (`@sfr/ui`) en una ventana
Tauri v2 y expone SQLite local vía `tauri-plugin-sql`.

## Estado

- **Frontend** (`src/`, `index.html`, `vite.config.ts`): `src/main.tsx` está
  conectado a un `SqlDriver` real (`src/db/tauri-sql-driver.ts`, sobre
  `@tauri-apps/plugin-sql`/`tauri-plugin-sql`), con el mismo patrón que
  `packages/web/src/main.tsx`: `migrate` + `seed` + `<ProveedorDatos>`.
- **Nativo** (`src-tauri/`): **compila y empaqueta correctamente** (verificado
  con `pnpm --filter @sfr/desktop build`: genera el `.exe`, el instalador MSI
  y el instalador NSIS `-setup.exe` en `src-tauri/target/release/bundle/`).
- **Verificado end-to-end**: se lanzó el `.exe` compilado y se inspeccionó
  directamente el archivo `sfr.db` que crea en
  `%APPDATA%\do.facturacion.sistema\sfr.db` — las 12 tablas existen, ambas
  migraciones quedaron registradas en `_migracion`, los datos de ejemplo
  (`seed`) están presentes, y la app abrió automáticamente un segundo ticket
  (`factura` #2, `estado='abierta'`) al montar la pantalla de Ventas — la
  misma señal que confirma que la PWA funciona. La ventana nativa en sí no se
  pudo capturar por captura de pantalla en este entorno (una ventana Tauri
  recién lanzada aparece "cloaked"/fuera de posición para `CopyFromScreen`
  en esta sesión de automatización — no está relacionado con el código de la
  app), pero la verificación contra el archivo SQLite real es una prueba más
  directa de que el driver funciona que una captura visual.

### ⚠️ Permiso de escritura SQL — importante si se toca `capabilities/`

`sql:default` (el permission set que trae el plugin) **solo otorga
`allow-load`, `allow-select` y `allow-close`** — de fábrica es de solo
lectura. Sin `sql:allow-execute` explícito, cada llamada a `db.execute()`
(usada por `exec()`/`run()` del driver, y por lo tanto por `migrate()` y
`seed()`) se rechaza a nivel de permisos de Tauri — se detectó porque
`sfr.db` quedaba creado pero con cero tablas después de correr la app.
`capabilities/default.json` ya incluye `"sql:allow-execute"` — no quitarlo.

## ⚠️ Nota de toolchain (importante en esta máquina) — RESUELTO

Hay **dos** instalaciones de Visual Studio:
- `VS 18 Community` (MSVC 14.50, preview) → **incompleta**, sin `msvcrt.lib`
  de escritorio (solo tiene la variante `onecore`, para UWP).
- `BuildTools 2022` (MSVC 14.44) → **completa**, con las libs y el Windows SDK.

rustc elige por defecto la más nueva (VS 18) y el link falla con
`LNK1104: cannot open file 'msvcrt.lib'`. Esto ya **no requiere pasos
manuales**: `scripts/vcvars-exec.cmd` envuelve `cargo`/`tauri` forzando el
entorno de BuildTools 2022 (y no hace nada si esa ruta no existe, para no
romper en otra máquina). Los scripts `dev`/`build` de este paquete ya lo usan
automáticamente — basta con `pnpm dev:desktop` / `pnpm --filter @sfr/desktop build`
desde la raíz.

(La solución de fondo, si se quiere evitar el wrapper, es completar la
instalación de VS 18 con el workload "Desarrollo para escritorio con C++".)

## Íconos

Ya generados en `src-tauri/icons/` a partir de `packages/web/public/icon.svg`
vía `pnpm --filter @sfr/desktop exec tauri icon ../web/public/icon.svg`.
`tauri.conf.json` referencia tanto `icon.png` como `icon.ico` (este último es
obligatorio para que el bundler de Windows —MSI/NSIS— funcione).

## Correr el escritorio

Requiere **Rust** (https://rustup.rs) instalado — ya lo está en esta máquina.

```
pnpm dev:desktop     # desarrollo: Vite en :5174 + ventana Tauri
pnpm --filter @sfr/desktop build   # release: .exe + instaladores MSI/NSIS
```

## Notas

- El `productName` es **facturAI**: de ahí salen el nombre del `.exe`, la carpeta
  de instalación, el acceso directo y el título de la ventana.
- El `identifier` sigue siendo `do.facturacion.sistema` **a propósito**, aunque el
  producto ya no se llame así: de él cuelga la carpeta de datos
  (`%APPDATA%\do.facturacion.sistema\sfr.db`), así que cambiarlo dejaría huérfana
  la base de cualquier instalación existente. Es un identificador interno, no se
  le muestra a nadie. Si alguna vez hay que cambiarlo, primero se migra el archivo.
- Al renombrar el `productName`, una instalación vieja **no** se actualiza: se
  instala al lado. Hay que desinstalar la anterior a mano.
- `capabilities/default.json` habilita los permisos base + los del plugin SQL.
