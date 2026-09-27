# Plan e-CF — tareas pendientes (rama `feature/ecf-dgii`)

Lista de trabajo viva. Se marca `[x]` al terminar cada tarea y se hace commit en ese momento, así
cualquiera (humano o IA) sabe exactamente dónde quedó el trabajo. Orden aprobado: **A → B → F → D → C → E → G**.

Ya hecho antes de este plan: emisión E31/E32/E34 + RFCE + ANECF, firma XMLDSig, cliente DGII,
cola de anulación, reconciliación de pendientes, QR en recibos (commits `311a6d8`, `2193d1f`).

Fuentes: documentación oficial DGII (Descripción Técnica Servicios DGII, Descripción Técnica
Emisores Electrónicos, Proceso de Certificación, Informe Técnico e-CF, XSD v1.0).

## A — Cerrar el acceso al API

- [ ] A1. Llave por caja (`X-Caja-Key`): tabla `caja_api_key` (hash SHA-256) en Postgres; plugin de auth
      acepta llave válida **o** JWT de Google cuyo correo esté en `API_CORREOS_PERMITIDOS`.
- [ ] A2. Script para emitir/revocar llaves de caja (`pnpm --filter @sfr/api caja-key`).
- [ ] A3. `DGII_RNC_EMISOR`: el API se niega a firmar para otro RNC (403) y al arrancar valida que el
      campo SN del certificado corresponda al RNC (si no, `disponible: false` con el motivo).
- [ ] A4. UI: campo en Configuración para pegar la llave de la caja; `apiClient` la envía.

## B — Servicios de recepción (obligatorios para postular)

- [ ] B1. XML ARECF (acuse de recibo) + ACECF (aprobación comercial), validados contra XSD oficiales.
- [ ] B2. Verificación de firma XMLDSig de documentos entrantes.
- [ ] B3. Rutas públicas (fuera del contexto protegido), rutas exactas DGII:
      `/fe/autenticacion/api/semilla`, `/fe/autenticacion/api/validacioncertificado`,
      `/fe/recepcion/api/ecf` (responde ARECF firmado), `/fe/aprobacioncomercial/api/ecf` (200/400).
- [ ] B4. Persistencia en Postgres: `ecf_recibido`, `aprobacion_comercial_recibida` (XML como texto).
- [ ] B5. API protegida para la app: listar recibidos, emitir aprobación/rechazo comercial
      (firma ACECF y envía a DGII + al emisor).
- [ ] B6. UI en Compras: "Comprobantes de proveedores" — ver, importar como compra, aprobar/rechazar.

## F — Esquema Postgres

- [ ] F1. `db/schema.sql` al día con todas las migraciones SQLite + tablas de A/B.
- [ ] F2. Test de deriva: falla si una migración SQLite agrega tabla/columna ausente en `schema.sql`;
      ejecuta `schema.sql` en Postgres real (PGlite) para detectar errores de sintaxis.
- [ ] F3. **(Necesita OK del usuario)** Aplicar a Supabase.

## D — Números "utilizados" y panel de administración

- [ ] D1. Antes de anular, consultar `consultatrackids` (RNC + e-NCF): si la DGII tiene trackId, no se
      anula — se reconcilia (el e-CF sí llegó).
- [ ] D2. Pantalla Configuración → Facturación electrónica: estado del servicio, vencimiento del
      certificado (aviso a 30 días), pendientes, cola de anulación (reintentar), utilizados
      (marcar revisado), rechazados con motivo.
- [ ] D3. Reintentar/reimprimir comprobantes desde Consultar facturas.

## C — Entrega al comprador (rol emisor)

- [ ] C1. `consultarDirectorio(rnc)` en el cliente DGII.
- [ ] C2. Tras aceptación de E31/E34 a un comprador electrónico: enviar el e-CF a su URL de recepción,
      guardar el ARECF; reintentos en el ciclo de seguimiento.

## E — Herramientas de certificación

- [ ] E1. Generador genérico fila → XML ordenado por XSD (sin tags vacíos), validado contra XSD.
- [ ] E2. Script `set-pruebas <archivo.xlsx>` (e-CF y aprobaciones). **Ajustar columnas al tener el Excel real.**
- [ ] E3. Auditoría de la representación impresa (Informe Técnico §18) + generador de PDFs de prueba.

## G — Preparar despliegue

- [ ] G1. `DGII_P12_BASE64` como alternativa al archivo.
- [ ] G2. Dockerfile + guía de despliegue (Render/Fly/Railway) para exponer los servicios de recepción con SSL.
- [ ] G3. Unificar clientes HTTP de chatbot/transferencias sobre `apiClient`.

## Necesita al usuario (no se avanza sin él)

- Hosting + dominio con SSL para las URL públicas (cuenta de Render/Fly/Railway).
- ISC de alcoholes (vinos del catálogo): código, tasa, grados, cantidad referencia — del contable.
- Política offline: mantener "sin conexión no hay venta fiscal" o adoptar contingencia DGII de 72 h.
- OK para aplicar el esquema a Supabase (F3).
- Certificado .p12 y acceso OFV (ver `packages/api/README.md`).

## Bitácora

- (se agrega una línea por sesión de trabajo)
