# Plan e-CF — tareas pendientes (rama `feature/ecf-dgii`)

Lista de trabajo viva. Se marca `[x]` al terminar cada tarea y se hace commit en ese momento, así
cualquiera (humano o IA) sabe exactamente dónde quedó el trabajo. Orden aprobado: **A → B → F → D → C → E → G**.

Ya hecho antes de este plan: emisión E31/E32/E34 + RFCE + ANECF, firma XMLDSig, cliente DGII,
cola de anulación, reconciliación de pendientes, QR en recibos (commits `311a6d8`, `2193d1f`).

Fuentes: documentación oficial DGII (Descripción Técnica Servicios DGII, Descripción Técnica
Emisores Electrónicos, Proceso de Certificación, Informe Técnico e-CF, XSD v1.0).

## A — Cerrar el acceso al API

- [x] A1. Llave por caja (`X-Caja-Key`): tabla `caja_api_key` (hash SHA-256) en Postgres; plugin de auth
      acepta llave válida **o** JWT de Google cuyo correo esté en `API_CORREOS_PERMITIDOS`.
- [x] A2. Script para emitir/revocar llaves de caja (`pnpm --filter @sfr/api caja-key`).
- [x] A3. `DGII_RNC_EMISOR`: el API se niega a firmar para otro RNC (403) y al arrancar valida que el
      campo SN del certificado corresponda al RNC (si no, `disponible: false` con el motivo).
- [x] A4. UI: campo en Configuración para pegar la llave de la caja; `apiClient` la envía.

## B — Servicios de recepción (obligatorios para postular)

- [x] B1. XML ARECF (acuse de recibo) + ACECF (aprobación comercial), validados contra XSD oficiales.
- [x] B2. Verificación de firma XMLDSig de documentos entrantes.
- [x] B3. Rutas públicas (fuera del contexto protegido), rutas exactas DGII:
      `/fe/autenticacion/api/semilla`, `/fe/autenticacion/api/validacioncertificado`,
      `/fe/recepcion/api/ecf` (responde ARECF firmado), `/fe/aprobacioncomercial/api/ecf` (200/400).
      Hecho: verificación de firma + SN del emisor, motivos 1-4 del ARECF, token opcional, rutas
      insensibles a mayúsculas. Sin Postgres o sin certificado responden 503.
- [x] B4. Persistencia en Postgres: `ecf_recibido`, `aprobacion_comercial_recibida` (XML como texto).
      Código en `fiscal/recepcion/almacen.ts`; tablas en `schema.sql`.
- [x] B5. API protegida para la app: listar recibidos, emitir aprobación/rechazo comercial
      (firma ACECF y envía a DGII + al emisor).
- [x] B6. UI en Compras: "Comprobantes de proveedores" — ver, importar como compra, aprobar/rechazar.

## F — Esquema Postgres

- [x] F1. `db/schema.sql` al día con todas las migraciones SQLite + tablas de A/B.
- [x] F2. Test de deriva: falla si una migración SQLite agrega tabla/columna ausente en `schema.sql`;
      ejecuta `schema.sql` en Postgres real (PGlite) para detectar errores de sintaxis.
- [ ] F3. **(Necesita OK del usuario)** Aplicar a Supabase.

## D — Números "utilizados" y panel de administración

- [x] D1. Antes de anular, consultar `consultatrackids` (RNC + e-NCF): si la DGII tiene trackId, no se
      anula — se reconcilia (el e-CF sí llegó).
- [x] D2. Pantalla Configuración → Facturación electrónica: estado del servicio, vencimiento del
      certificado (aviso a 30 días), pendientes, cola de anulación (reintentar), utilizados
      (marcar revisado), rechazados con motivo.
- [x] D3. Consultar facturas: botón "Consultar estado en la DGII" para comprobantes en validación,
      guía para rechazados; reimprimir ya incluye QR. **Pendiente de decisión:** re-emitir un
      comprobante rechazado (nuevo e-NCF para la misma venta) — confirmar el procedimiento con el contador.

## C — Entrega al comprador (rol emisor)

- [x] C1. `consultarDirectorio(rnc)` en el cliente DGII.
- [x] C2. Tras aceptación de E31/E34 a un comprador electrónico: enviar el e-CF a su URL de recepción,
      guardar el ARECF; reintentos en el ciclo de seguimiento.

## E — Herramientas de certificación

- [x] E1. Generador genérico fila → XML ordenado por XSD (sin tags vacíos), validado contra XSD.
- [x] E2. `pnpm --filter @sfr/api set-pruebas <archivo.xlsx> [--enviar]`. Simulacro por defecto (firma con
      certificado autofirmado si aún no hay .p12). **Al descargar el Excel real:** correr el simulacro y revisar
      "columnas sin usar" en la salida; si aparecen, ajustar la convención de nombres en
      `src/fiscal/certificacion/generador.ts`.
- [x] E3. Representación impresa según Informe Técnico §18 en los 4 formatos (nombre oficial del tipo,
      e-NCF, válido hasta, razón social emisor/comprador, "E" en exentos, ITBIS por línea, QR ≥ 2 cm del
      borde). Los PDF del paso 5 salen de Consultar facturas → PDF. **Falta:** Municipio/Provincia del
      emisor (el negocio no tiene esos campos) y la RI de notas de crédito (las devoluciones no imprimen).

## G — Preparar despliegue

- [x] G1. `DGII_P12_BASE64` como alternativa al archivo.
- [x] G2. `packages/api/Dockerfile` (probado: build + arranque local) y `packages/api/DESPLIEGUE.md`.
- [x] G3. Chatbot y transferencias usan `apiClient` (de paso: el chatbot no enviaba credenciales y fallaba con 401 al activar la autenticación).

## Necesita al usuario (no se avanza sin él)

- Hosting + dominio con SSL para las URL públicas (cuenta de Render/Fly/Railway).
- ISC de alcoholes (vinos del catálogo): código, tasa, grados, cantidad referencia — del contable.
- Política offline: mantener "sin conexión no hay venta fiscal" o adoptar contingencia DGII de 72 h.
- OK para aplicar el esquema a Supabase (F3).
- Certificado .p12 y acceso OFV (ver `packages/api/README.md`).

## Bitácora

- 2026-09-27 (noche): Fase A completa (auth por llave de caja + lista de correos, RNC fijo + validación
  SN del certificado, sección "Facturación electrónica" en Configuración). Falta crear la tabla
  `caja_api_key` en Postgres (va en F1). **Siguiente: B1.**
