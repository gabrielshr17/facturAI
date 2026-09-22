# @sfr/api (backend multi-caja/multiusuario)

Backend Fastify para el modo multi-caja/multiusuario (§ Flujo de datos y
modos, plan.md). **El modo 100% local (default) no necesita este paquete
corriendo** — el cliente (Tauri/PWA) habla directo con su SQLite local.

## Estado: Auth conectada, resto sigue en scaffold

Hay un proyecto real de Supabase (`facturai`, ver `.env`) con **Sign in with
Google** habilitado y JWT verificado de verdad. **PowerSync y el Postgres de
negocio (`db/schema.sql`) siguen sin conectar**:

- `GET /health` — responde siempre; indica si Supabase/PowerSync están
  configurados (`supabaseConfigurado`/`powersyncConfigurado`), no si están
  *funcionando*.
- Auth (`src/plugins/auth.ts`): con `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
  configurados (ya lo están, ver `.env`), cada solicitud con
  `Authorization: Bearer <token>` se valida de verdad contra Supabase
  (`supabase.auth.getUser(token)`) — 401 si el token es inválido/expiró. Sin
  esas variables, sigue el modo scaffold: todas las solicitudes pasan como
  usuario de desarrollo fijo (`dev-local`).
- `POST /fiscal/transmitir` (§ Módulo fiscal): responde `501` siempre. Sigue
  pendiente la decisión "PAC certificado vs. integración directa a la DGII"
  (ver `plan.md`, "Decisiones aún pendientes"). El cliente hoy usa
  `crearProveedorFiscalSimulado()` de `@sfr/core` para desarrollo.
- `db/schema.sql`: traducción a Postgres de las migraciones SQLite de
  `@sfr/core` — **desactualizada**, le faltan tablas agregadas después
  (cotización, devolución, promoción, favoritos). No se ha corrido contra el
  Postgres del proyecto: hace falta ponerla al día con
  `packages/core/src/db/migrations.ts` antes de ejecutarla.
- `sync-rules.yaml`: reglas de PowerSync de referencia (bucket único,
  asumiendo negocio single-tenant); se sube al dashboard de PowerSync cuando
  haya un proyecto.
- `notificacion_transferencia` (§ Últimas transferencias recibidas) es la
  **excepción**: esa tabla sí está creada en el Postgres real del proyecto
  (aplicada directo, no vía el resto de `schema.sql` que sigue desactualizado
  — ver más abajo). Las rutas `/transferencias/*` funcionan en cuanto
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` estén configuradas, sin
  depender de Gmail/Gemini.

## Últimas transferencias recibidas (correo del banco)

Sin agregador bancario: el banco manda un correo de notificación por cada
transferencia, y el backend sondea una casilla Gmail dedicada cada
`TRANSFERENCIAS_POLL_INTERVALO_MS` (default 5 min) para leerlos con la
Gmail API y pedirle a Gemini (Google AI Studio, no Claude — es independiente
del chatbot de comprobantes) que extraiga monto/fecha/banco/referencia.

Pasos de configuración manual (una sola vez):

1. Crear una casilla Gmail nueva y gratis, dedicada solo a esto.
2. En Gmail y Outlook (las cuentas reales del negocio), crear una regla de
   reenvío automático nativa hacia esa casilla dedicada — nunca guardar la
   contraseña del banco ni de esas cuentas en ningún lado.
3. En Google Cloud Console, crear un proyecto, habilitar la Gmail API, y
   crear credenciales OAuth 2.0 (tipo "Desktop app") con el scope
   `https://www.googleapis.com/auth/gmail.modify` (lectura + quitar la
   etiqueta "no leído").
4. Generar un refresh token para la casilla dedicada (flujo OAuth estándar,
   una sola vez) y copiar client id/secret/refresh token a
   `GMAIL_OAUTH_CLIENT_ID`/`GMAIL_OAUTH_CLIENT_SECRET`/`GMAIL_OAUTH_REFRESH_TOKEN`
   en `.env`.
5. Sacar una API key de Gemini en [Google AI Studio](https://aistudio.google.com/apikey)
   y copiarla a `GEMINI_API_KEY` en `.env`.

Sin esas cuatro variables, el poller simplemente no arranca (log de
advertencia al iniciar) — `GET /transferencias/recientes` sigue respondiendo
con lo que ya haya en la tabla.

Este paquete no corre 24/7 en ningún hosting todavía — el poller solo lee
correo mientras el proceso está vivo. Un plan gratuito de Render/Railway/
Fly.io alcanza para el volumen de un negocio pequeño.

## Qué falta para el resto de Fase 2

1. Poner `db/schema.sql` al día con las migraciones SQLite actuales y
   correrlo contra el Postgres del proyecto Supabase.
2. Crear un proyecto de **PowerSync**, apuntarlo a ese Postgres, subir
   `sync-rules.yaml`, y copiar `POWERSYNC_URL` a `.env`.
3. Implementar `POST /fiscal/transmitir` una vez decidido PAC vs. DGII
   directo (certificado digital, custodia de credenciales, etc. — ver
   `plan.md`).

## Correr en local (modo scaffold, sin credenciales)

```
pnpm --filter @sfr/api dev
```

Arranca en `http://localhost:3001` (configurable con `PORT`). `GET /health`
debe responder `{"estado":"ok", "supabaseConfigurado": false, ...}`.
