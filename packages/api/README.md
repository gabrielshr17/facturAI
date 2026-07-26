# @sfr/api (backend multi-caja/multiusuario)

Backend Fastify para el modo multi-caja/multiusuario (§ Flujo de datos y
modos, plan.md). **El modo 100% local (default) no necesita este paquete
corriendo** — el cliente (Tauri/PWA) habla directo con su SQLite local.

## Estado: scaffold, sin conectar

Este paquete arranca y sirve rutas, pero **no está conectado a ningún
proyecto real de Supabase ni de PowerSync todavía**:

- `GET /health` — responde siempre; indica si Supabase/PowerSync están
  configurados (`supabaseConfigurado`/`powersyncConfigurado`), no si están
  *funcionando*.
- Auth (`src/plugins/auth.ts`): sin credenciales, todas las solicitudes pasan
  como un usuario de desarrollo fijo (`dev-local`). Con credenciales
  presentes pero sin cliente Supabase implementado, responde `501` en vez de
  fingir que validó el token — **no hay verificación real de JWT todavía**.
- `POST /fiscal/transmitir` (§ Módulo fiscal): responde `501` siempre. Sigue
  pendiente la decisión "PAC certificado vs. integración directa a la DGII"
  (ver `plan.md`, "Decisiones aún pendientes"). El cliente hoy usa
  `crearProveedorFiscalSimulado()` de `@sfr/core` para desarrollo.
- `db/schema.sql`: traducción a Postgres de las migraciones SQLite de
  `@sfr/core`, lista para correr contra el Postgres de un proyecto Supabase
  cuando exista (no se ejecuta sola).
- `sync-rules.yaml`: reglas de PowerSync de referencia (bucket único,
  asumiendo negocio single-tenant); se sube al dashboard de PowerSync cuando
  haya un proyecto.

## Qué falta para activarlo de verdad

1. Crear un proyecto de **Supabase** → copiar `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY` a `.env` (ver `.env.example`).
2. Correr `db/schema.sql` contra el Postgres de ese proyecto.
3. Implementar la verificación real de JWT en `src/plugins/auth.ts` (paquete
   `@supabase/supabase-js`, `supabase.auth.getUser(token)`).
4. Crear un proyecto de **PowerSync**, apuntarlo al mismo Postgres, subir
   `sync-rules.yaml`, y copiar `POWERSYNC_URL` a `.env`.
5. Implementar `POST /fiscal/transmitir` una vez decidido PAC vs. DGII
   directo (certificado digital, custodia de credenciales, etc. — ver
   `plan.md`).

## Correr en local (modo scaffold, sin credenciales)

```
pnpm --filter @sfr/api dev
```

Arranca en `http://localhost:3001` (configurable con `PORT`). `GET /health`
debe responder `{"estado":"ok", "supabaseConfigurado": false, ...}`.
