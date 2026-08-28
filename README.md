# facturAI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Sistema de facturación, inventario y gestión para negocios en República
Dominicana (comprobantes fiscales e-CF, impresión térmica ESC/POS, control
de inventario, clientes, compras, corte de caja, reportes).

Monorepo pnpm con un dominio compartido (`@sfr/core`) y una UI compartida
(`@sfr/ui`) que corre tanto en el navegador (PWA, `@sfr/web`) como en
escritorio (Tauri, `@sfr/desktop`). Un backend opcional (`@sfr/api`) da
soporte al modo multi-caja/multiusuario y al asistente de chat.

## Estructura del monorepo

```
packages/
  core/     dominio, validaciones, repos y acceso a SQLite (compartido)
  ui/       pantallas y componentes React (compartidos entre web y desktop)
  web/      app instalable como PWA (Vite + sql.js/IndexedDB)
  desktop/  app de escritorio Windows (Tauri v2) con impresión térmica real
  api/      backend opcional Fastify (multi-caja, auth, chatbot)
```

Por defecto, **todo funciona 100% local**: cada instalación (web o desktop)
usa su propia base SQLite; `@sfr/api` solo hace falta si se quiere activar
sincronización multi-caja o el chatbot.

## Requisitos

- **Node.js** ≥ 22
- **pnpm** ≥ 11 (`corepack enable` o `npm i -g pnpm`)
- Solo para el escritorio (`@sfr/desktop`):
  - **Rust** (https://rustup.rs)
  - En Windows, el toolchain de compilación de C++ de Visual Studio
    (Build Tools 2022 o el workload "Desarrollo para escritorio con C++")
  - Una impresora térmica ESC/POS es opcional; sin ella la app cae al
    recibo imprimible del navegador

## Instalación

```bash
git clone https://github.com/gabrielshr17/facturAI.git
cd facturAI
pnpm install
```

## Correr la app web (PWA)

```bash
pnpm dev:web
```

Abre `http://localhost:5173`. La base de datos vive en el navegador
(sql.js + IndexedDB) — no requiere backend.

## Correr la app de escritorio (Tauri)

```bash
pnpm dev:desktop
```

Levanta Vite + una ventana nativa de Windows con SQLite local en
`%APPDATA%\do.facturacion.sistema\sfr.db`. Ver `packages/desktop/README.md`
para detalles de toolchain, empaquetado (`.exe`/MSI/NSIS) e impresión
térmica.

## Backend opcional (`@sfr/api`)

Solo necesario para sincronización multi-caja o el chatbot con visión.

```bash
cp packages/api/.env.example packages/api/.env
# completar ANTHROPIC_API_KEY (chatbot) y/o las variables de Supabase/PowerSync
pnpm dev:api
```

Sin `.env`, el backend arranca igual: `/health` responde, pero auth y el
chatbot devuelven placeholders/501. Ver `packages/api/README.md`.

## Base de datos: migraciones y datos de ejemplo

```bash
pnpm db:migrate   # crea/actualiza el esquema SQLite
pnpm db:seed      # datos de ejemplo para desarrollo
```

## Scripts útiles

```bash
pnpm typecheck    # tsc --noEmit en todos los paquetes
pnpm test         # vitest en todos los paquetes
pnpm build        # build de producción de todos los paquetes
```

## Notas

- El archivo `productDatabase/` (base de datos real de productos de un
  negocio) está deliberadamente excluido del repo (`.gitignore`) por
  contener datos comerciales reales.
- Este repositorio es público; no subir `.env`, bases de datos reales
  (`*.db`, `*.xlsx`) ni credenciales.

## Licencia

MIT — ver [LICENSE](./LICENSE).
