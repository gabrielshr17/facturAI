# Desplegar el backend (servicios de recepción e-CF)

La DGII exige que todo emisor electrónico tenga **en internet, con SSL**, sus servicios de
**recepción de e-CF** y de **aprobación comercial** (y opcionalmente autenticación). Las URLs se
piden en el formulario de postulación (paso 1 de la certificación), así que el backend tiene que
estar desplegado **antes** de postular.

Requisitos de la DGII para estos servicios (Descripción Técnica Emisores Electrónicos):

- HTTPS con certificado SSL válido, puertos tradicionales (443).
- Accesibles desde internet; el dominio no puede estar en listas negras ni categorizado como proxy.
- Rutas insensibles a mayúsculas (ya lo están).

## Qué URLs registrar en la DGII

Las rutas son fijas por estándar; solo cambia el host. Si el backend queda en
`https://fe.suplidoramarohi.do`:

| Campo del formulario | URL |
|---|---|
| URL Recepción | `https://fe.suplidoramarohi.do` |
| URL Aprobación Comercial | `https://fe.suplidoramarohi.do` |
| URL Autenticación | `https://fe.suplidoramarohi.do` |

Los demás contribuyentes (y la DGII) agregan `/fe/recepcion/api/ecf`,
`/fe/aprobacioncomercial/api/ecf` y `/fe/autenticacion/api/...` a ese host, igual que con el
servicio de prueba de la DGII (`https://ecf.dgii.gov.do/testecf/emisorreceptor` + ruta). Si el
portal de certificación rechaza el host solo, registrar la URL completa de cada servicio.

## Imagen Docker

Se construye desde la raíz del repositorio:

```
docker build -f packages/api/Dockerfile -t facturai-api .
docker run -p 3001:3001 --env-file packages/api/.env facturai-api
```

Verificado localmente: la imagen arranca en modo producción, carga el certificado desde
`DGII_P12_BASE64`, sirve `/fe/*` sin credenciales y rechaza `/fiscal/*` sin llave de caja.

## Variables de entorno en producción

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` (ya viene en la imagen). Sin Supabase, **rechaza** las rutas protegidas en vez de abrirlas. |
| `DGII_AMBIENTE` | `testecf` → `certecf` → `ecf` según la etapa |
| `DGII_RNC_EMISOR` | RNC de la empresa |
| `DGII_P12_BASE64` | el `.p12` en base64 (ver `.env.example` para generarlo en PowerShell) |
| `DGII_P12_PASSWORD` | contraseña del `.p12` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | proyecto Supabase (guarda e-CF recibidos y llaves de caja) |
| `API_CORREOS_PERMITIDOS` | correos de Google con permiso fiscal (opcional si se usan llaves de caja) |

Todo como **secreto** del hosting; nunca en el repositorio.

## Opción recomendada: Render (plan con disco no hace falta)

1. New → Web Service → conectar el repositorio de GitHub.
2. Runtime **Docker**, Dockerfile path `packages/api/Dockerfile`, Docker context `.` (raíz).
3. Cargar las variables de la tabla anterior en *Environment*.
4. Health check path: `/health` (debe responder `fiscal.disponible: true`).
5. Settings → Custom Domain → agregar el subdominio (ej. `fe.suplidoramarohi.do`) y crear el
   registro CNAME que indica Render. Render emite el certificado SSL solo.

**Una sola instancia**: los tokens de la autenticación emisor-receptor viven en memoria; no escalar
horizontalmente sin moverlos a Postgres primero. En el plan gratuito de Render el servicio se
"duerme" y tarda en despertar: para producción usar un plan pago (la DGII y los proveedores deben
poder entregar comprobantes en cualquier momento).

Fly.io (`fly launch --dockerfile packages/api/Dockerfile`) o Railway funcionan igual: imagen Docker,
variables como secretos, dominio propio con SSL automático.

## Antes de postular

1. Aplicar `db/schema.sql` en el Postgres de Supabase (con OK del dueño).
2. Emitir una llave por caja: `pnpm --filter @sfr/api caja-key emitir "Caja 1"` y pegarla en
   Configuración → Facturación electrónica de esa caja.
3. `GET https://<host>/health` → `fiscal.disponible: true`.
4. `GET https://<host>/fe/autenticacion/api/semilla` → XML `SemillaModel`.
5. Registrar las URLs en el formulario de postulación.
