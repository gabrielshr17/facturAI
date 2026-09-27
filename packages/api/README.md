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
- `/fiscal/*` (§ Módulo fiscal e-CF): integración **directa** con la DGII
  ("Software de Desarrollo Propio"). Firma con el `.p12` de la empresa y
  transmite; no guarda comprobantes (la fuente de verdad sigue siendo el
  SQLite del cliente). Sin `DGII_P12_PATH`/`DGII_P12_PASSWORD` responde `503`.
  Ver "Facturación electrónica (e-CF)" más abajo.
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

## Facturación electrónica (e-CF)

Todo el código vive en `src/fiscal/`:

| Archivo | Qué hace |
|---|---|
| `xml/ecf.ts` | XML e-CF 31/32/34 (validado contra los XSD oficiales en `test/fiscal/xsd/`) |
| `xml/rfce.ts` | Resumen de factura de consumo (E32 < RD$250,000) |
| `xml/anecf.ts` | Anulación de e-NCF no utilizados |
| `firma.ts` | Lee el `.p12` y firma XMLDSig (RSA-SHA256, C14N, firma envuelta) |
| `codigo-seguridad.ts` / `qr.ts` | Código de seguridad (6 primeros caracteres del SignatureValue) y URL del QR |
| `dgii-cliente.ts` | Semilla → token (en caché), recepción e-CF, recepción RFCE, consulta por trackId, anulación |
| `servicio-emision.ts` | Decide RFCE vs. e-CF completo, firma, envía y arma el resultado |

Rutas: `GET /fiscal/estado`, `POST /fiscal/comprobantes`,
`GET /fiscal/comprobantes/:trackId`, `POST /fiscal/anulaciones`.

Errores: `400` documento inválido, `502` la DGII rechazó la solicitud,
`503` DGII caída o módulo sin configurar, `500` inesperado.

### Cuando llegue el certificado (.p12) y el acceso a la OFV

1. Guardar el `.p12` **fuera del repo** (ej. `C:\facturai\certificado\empresa.p12`).
   `*.p12`/`*.pfx` están en `.gitignore` igual.
2. En `packages/api/.env`:
   ```
   DGII_AMBIENTE=testecf
   DGII_P12_PATH=C:\facturai\certificado\empresa.p12
   DGII_P12_PASSWORD=<la contraseña que dio la certificadora>
   ```
3. `pnpm --filter @sfr/api dev` → el log debe decir
   `Facturación electrónica activa (DGII testecf)`, y `GET /fiscal/estado`
   devuelve `disponible: true` con la fecha de vencimiento del certificado.
4. En el cliente (`packages/web/.env` o `packages/desktop/.env`):
   `VITE_FISCAL_MODO=dgii` y `VITE_API_URL=<url del backend>`. Sin eso, la
   app sigue usando el simulador (no envía nada a la DGII).
5. En Configuración de la app: RNC, **razón social** y dirección del negocio
   exactamente como están en la DGII, y las secuencias e-NCF autorizadas
   (E31/E32/E34) con su vencimiento.
6. Set de pruebas: emitir desde la app en `testecf`. Al aprobarlo, pasar a
   `DGII_AMBIENTE=certecf` y finalmente `ecf` (producción).

Verificado sin certificado real: contra `testecf`, la DGII entrega la
semilla, recibe la semilla firmada y la rechaza solo por
`"Tipo de certificado no admitido"` (el de prueba es autofirmado).

Pendiente de confirmar con la DGII durante la certificación: si piden
exponer servicios de **recepción** (e-CF de proveedores y aprobación
comercial) en una URL pública — hoy no están implementados.

## Qué falta para el resto de Fase 2

1. Poner `db/schema.sql` al día con las migraciones SQLite actuales y
   correrlo contra el Postgres del proyecto Supabase.
2. Crear un proyecto de **PowerSync**, apuntarlo a ese Postgres, subir
   `sync-rules.yaml`, y copiar `POWERSYNC_URL` a `.env`.

## Correr en local (modo scaffold, sin credenciales)

```
pnpm --filter @sfr/api dev
```

Arranca en `http://localhost:3001` (configurable con `PORT`). `GET /health`
debe responder `{"estado":"ok", "supabaseConfigurado": false, ...}`.
