# Plan — módulo fiscal e-CF (traspaso a la máquina que emite)

Estado al 2026-10-05. Origen: repo `gabrielshr17/facturAI`, rama `master`, commit `a075174`.
Este plan resume lo construido, lo que falta y lo que hay que vigilar. El detalle técnico fino está en
`archivos-nuevos/plan-ecf.md` (bitácora de fases) y `archivos-nuevos/docs/investigacion-fiscal.md` (investigación legal).

## 1. Qué es el módulo fiscal

Emisión y recepción de Comprobantes Fiscales Electrónicos (e-CF) directamente contra la DGII de República
Dominicana ("Software de Desarrollo Propio"). Tiene dos mitades:

- **Backend `@sfr/api` (Fastify)**: firma XMLDSig con el certificado .p12, cliente de la DGII (semilla, token, envío,
  consulta de resultado, anulación, directorio), servicios públicos de recepción y aprobación comercial, y las
  herramientas de certificación (`set-pruebas`). **Es el que se registra ante la DGII y el que necesita el certificado.**
- **Dominio `@sfr/core` y pantallas `@sfr/ui`**: reglas de cobro fiscal, secuencias de NCF, notas de crédito y débito,
  comprobantes de compra, cola de anulación, seguimiento, y las pantallas que los usan.

La app de caja funciona 100% local; el backend solo se usa para emitir y recibir. Si no hay conexión no hay venta
fiscal (decisión vigente); la contingencia de 72 horas queda para después.

## 2. Estado por tipo de comprobante

| Tipo | Emitible desde la app | XML y certificación (`set-pruebas`) |
|---|---|---|
| E31 crédito fiscal, E32 consumo, E34 nota de crédito | Sí | Sí |
| E33 nota de débito | Sí (Consultar facturas) | Sí |
| E45 gubernamental | Sí (modal de cobro) | Sí |
| E41 compras, E43 gastos menores, E47 pagos al exterior | Sí (detalle de una compra, "Emitir comprobante fiscal") | Sí |
| E44 regímenes especiales, E46 exportaciones | **No**: exigen un ticket exonerado de ITBIS que la app no tiene | Sí (filas manuales validadas contra el XSD) |

Además: RFCE (resumen de consumo menor a RD$250,000), ANECF (anulación), ARECF y ACECF (acuse y aprobación comercial).

## 3. Mapa del código

Backend (`packages/api/src/fiscal/`): `xml/` (ecf, perfiles por tipo, totales, rfce, anecf, arecf, acecf), `firma.ts`,
`dgii-cliente.ts`, `servicio-emision.ts`, `entrega.ts`, `servicio-entrega.ts`, `servicio-recibidos.ts`,
`verificacion.ts`, `qr.ts`, `codigo-seguridad.ts`, `iniciar.ts`, `recepcion/` (almacén, autenticación, raíces CA),
`certificacion/` (generador fila→XML por XSD, `set-pruebas`, certificado efímero, validación XSD).
Rutas: `routes/fiscal.ts`, `routes/recepcion.ts`, `routes/recibidos.ts`, `plugins/auth.ts`. XSD oficiales en `packages/api/xsd/`.

Dominio (`packages/core/src/fiscal/`): `cobro-fiscal.ts`, `devolucion-fiscal.ts` (nota de crédito),
`nota-debito-fiscal.ts`, `comprobante-compra.ts` (E41/E43/E47), `transmision.ts`, `seguimiento.ts`, `proveedor.ts`.
Repos: `comprobante-fiscal-repo.ts`, `secuencia-ncf-repo.ts`, `ncf-anulacion-repo.ts`.

Rutas públicas que exige la DGII (sin autenticación propia, firmadas): `/fe/autenticacion/api/semilla`,
`/fe/autenticacion/api/validacioncertificado`, `/fe/recepcion/api/ecf`, `/fe/aprobacioncomercial/api/ecf`.
Rutas protegidas para la app (llave de caja o inicio de sesión de Google permitido): `/fiscal/*`.

## 4. Despliegue ya hecho (origen)

- Backend en Render, imagen Docker (`packages/api/Dockerfile`, contexto la raíz del repo), una sola instancia,
  health check `/health`. Dominio con SSL: `https://fe.facturaird.com` (CNAME en Cloudflare, **DNS only**, sin proxy).
- Supabase: esquema `packages/api/db/schema.sql` aplicado (28 tablas, RLS activado en todas, sin políticas).
  `notificacion_transferencia` ya existía en el proyecto y el esquema la respeta.
- Variables en Render (nombres, **nunca valores en el repo**): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DGII_AMBIENTE` (`testecf` → `certecf` → `ecf`), `DGII_RNC_EMISOR`, `API_CORREOS_PERMITIDOS`, y cuando llegue el
  certificado `DGII_P12_BASE64` + `DGII_P12_PASSWORD`. Opcional `DGII_CA_RAICES_PATH`.
- Plan de Render: gratuito por ahora; **pasar al de pago (Starter, 512 MB) antes de poner el certificado y de postular**,
  porque el gratuito se duerme y la DGII entrega comprobantes cuando quiere. Medido: el contenedor usa ~200 MiB en reposo.
- Pasos detallados: `archivos-nuevos/packages/api/DESPLIEGUE.md`.

## 5. Lo que falta, en orden

1. **Certificado .p12** (Procedimiento Tributario, a nombre del Usuario Administrador e-CF). El campo SN debe contener el
   RNC; el API se niega a firmar si no coincide. Se carga como `DGII_P12_BASE64` / `DGII_P12_PASSWORD`.
   **Nunca se pega el archivo ni la contraseña en un chat ni se guarda en git.**
2. Cambiar el plan de Render y comprobar `GET /health` → `fiscal.disponible: true`.
3. Solicitud FI-GDF-016 en la OFV → acceso al Portal de Certificación → pruebas de pre-certificación.
4. Postulación firmada con las tres URLs (recepción, aprobación comercial y autenticación de `fe.facturaird.com`).
5. Descargar el **Excel del set de pruebas** y correr `pnpm --filter @sfr/api set-pruebas <archivo.xlsx>` en
   simulacro; revisar "columnas sin usar" y ajustar la convención de nombres en
   `src/fiscal/certificacion/generador.ts`. Después `--enviar`. Si un e-CF sale "Rechazado" hay que reiniciar el set.
6. Pasos 4 a 14 del proceso oficial: ver `docs/dgii/pdf/` (los PDF no van en git; se descargan de
   https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx).

## 6. Decisiones tomadas (y por qué)

- **ISC de alcoholes: no se construye.** El formato oficial limita esos campos al productor, fabricante o importador;
  el negocio compra el vino a un distribuidor. Falta la confirmación del contador. Ver `docs/investigacion-fiscal.md`.
- **E44 y E46 no se emiten desde la app**: requieren un modo de ticket exonerado de ITBIS. Postular solo por los tipos que se usan.
- **Retenciones de E41 y E47 las digita el usuario.** Referencias halladas (a confirmar con el contador): 100% del ITBIS en
  compras a proveedores informales; 27% de ISR en pagos al exterior; el ISR en servicios de personas físicas no quedó confirmado.
- **Comprobante rechazado**: el e-NCF no se reutiliza; se emite uno nuevo y el rechazado se anula. Re-emitir sobre la misma
  venta sigue sin flujo propio en la app (confirmar con el contador).
- **Sin multicaja**: se autentica con inicio de sesión de Google (`API_CORREOS_PERMITIDOS`), sin llaves de caja ni PowerSync.
- **Una sola instancia** del backend: los tokens de autenticación entre emisor y receptor viven en memoria.

## 7. Trampas conocidas

- **Choque de migraciones entre repos hermanos.** El migrador decide qué está aplicado solo por **número** de migración.
  Si el destino ya tiene migraciones propias, los números 11 a 17 de este módulo pueden coincidir con otras. Ver la
  tabla en `HANDOFF-PROMPT.md`. Pasó de verdad: una base de datos creada por otro fork tenía su propia migración 11 y esta
  app nunca creó `fecha_firma` ("no such column: fecha_firma").
- **Mismo archivo de base de datos.** Dos apps de escritorio con el mismo identificador (`do.facturacion.sistema`) y el mismo
  archivo (`sfr.db`) se pisan. No ejecutarlas en la misma máquina contra el mismo archivo.
- **Driver de escritorio**: `tauri-plugin-sql` ejecuta cada sentencia por separado y sin transacción. Por eso la migración
  de `comprobante_fiscal` (14 a 16) está partida en pasos reanudables. Cualquier migración nueva debe pensarse así.
- **Ninguna pantalla nueva se ha visto en un navegador** (nota de débito, E45 en el cobro, emisión desde Compras,
  "Imprimir nota" tras una devolución, reimpresión de notas, municipio y provincia). Hay que revisarlas a 375, 768 y 1440 px.
- **Nada se ha enviado nunca a la DGII real.** Todo está probado con servidores falsos y con el XSD.
- El PostgreSQL de Supabase solo guarda lo del servidor (e-CF recibidos, llaves de caja); el esquema completo se aplicó,
  pero la app local no lo usa.

## 8. Cómo comprobar que todo está sano

```
pnpm install
pnpm -r typecheck
pnpm -r test        # al 2026-10-02: core 229, api 201, ui 20 pruebas
pnpm lint
```

Con el certificado puesto: `GET https://<host>/health` debe dar `fiscal.disponible: true`.
`GET https://<host>/fe/autenticacion/api/semilla` devuelve el XML `SemillaModel` aun sin certificado.
