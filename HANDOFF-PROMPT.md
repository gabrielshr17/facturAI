# Prompt de traspaso (pégalo tal cual en Claude Code, en la máquina que va a emitir los e-CF)

> Este paquete vive en la rama `docs/handoff-fiscal-bundle` de `gabrielshr17/facturAI` (rama aparte, nunca se fusiona a
> `master`). Para bajarlo en esa máquina:
> `git clone --branch docs/handoff-fiscal-bundle --single-branch https://github.com/gabrielshr17/facturAI.git handoff-fiscal`
> El código ya fusionado está en la rama `master` del mismo repo. Si el destino es un clon de ese repo, no necesitas
> los archivos de esta carpeta: te basta `git pull` y el Paso 0 de abajo.

---

Voy a traerte el **módulo fiscal e-CF** de otro proyecto. Lee primero `handoff-fiscal/PLAN.md` y
`handoff-fiscal/MANIFEST.md`. Respeta mis reglas globales (`~/.claude/CLAUDE.md`): nada de firmas de IA en commits o PR,
sin comentarios en el código, TypeScript sin `any`, nunca editar ni subir directo a `master`/`main`, ramas
`feature/…`/`fix/…`, commits convencionales, TDD y revisión antes de commitear.

## Paso 0 — NO sigas sin esto: averigua si ya está construido aquí

No asumas nada. Explora **sin modificar nada** y dime el resultado antes de aplicar cualquier cambio.

1. **¿Qué repo es este?** `git remote -v`, `git log --oneline | head -20`, `ls packages`. ¿Es un clon de
   `gabrielshr17/facturAI` (o `…/facturAI2.0`, o un repo distinto)?
2. **¿Existe ya el módulo?** Comprueba estos marcadores uno por uno y anota Sí/No:
   - `packages/api/src/fiscal/` con `firma.ts`, `dgii-cliente.ts`, `servicio-emision.ts`, `xml/perfiles.ts`,
     `recepcion/`, `certificacion/set-pruebas.ts`
   - `packages/api/xsd/` con los 15 XSD (ecf-31 … ecf-47, rfce-32, acecf, anecf, arecf)
   - `packages/core/src/fiscal/` con `cobro-fiscal.ts`, `nota-debito-fiscal.ts`, `comprobante-compra.ts`,
     `devolucion-fiscal.ts`, `transmision.ts`, `seguimiento.ts`
   - `packages/core/src/repos/` con `comprobante-fiscal-repo.ts`, `secuencia-ncf-repo.ts`, `ncf-anulacion-repo.ts`
   - En `packages/core/src/db/` busca las migraciones con estos nombres (y su número): `ecf_dgii`, `ecf_entrega_receptor`,
     `comprobante_receptor_nombre`, `comprobante_de_compra_respaldo`, `comprobante_de_compra_tabla`,
     `comprobante_de_compra_restaurar`, `negocio_ubicacion`. Ojo: pueden estar en `migrations.ts` o en archivos
     sueltos (`migraciones/NN-nombre.ts`).
   - `git log --oneline -i --grep="fiscal\|e-cf\|dgii"`
3. **Corre las pruebas** (`pnpm install`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm lint`) y dime los resultados.
   Referencia en el origen: core 229, api 201, ui 20 pruebas, typecheck y lint limpios.
4. **Clasifica el caso y propón el plan** (espera mi aprobación antes de tocar código):
   - **A. Ya está todo y las pruebas pasan** → no portes nada. Solo verifica el despliegue y pasa a la sección "Después".
   - **B. Está parcialmente** → lista exactamente qué archivos y funciones faltan comparando contra `MANIFEST.md`.
   - **C. No existe** → porta el módulo completo.

## Cómo aplicar el módulo (casos B y C)

El paquete trae tres cosas:
- `archivos-nuevos/`: 125 archivos que **no existían** antes en el repo origen. Cópialos respetando la ruta.
- `cambios-en-archivos-compartidos.patch` y `archivos-modificados-completos/`: 44 archivos que **ya existían** y se
  modificaron. **No los sobrescribas a ciegas**: si este repo no es un clon del origen, el parche no aplicará limpio.
  Pruébalo primero con `git apply --check cambios-en-archivos-compartidos.patch`. Si falla, usa los archivos completos solo
  como **referencia** y fusiona a mano, archivo por archivo, conservando lo que este repo ya tenga.
- `pnpm-lock.yaml` no se copia: regenera con `pnpm install`.

Trabaja en una rama (`feature/modulo-fiscal-ecf`), en fases pequeñas, con las pruebas del módulo pasando en cada una.

### Trampa principal: choque de migraciones

El migrador del origen decide qué migraciones están aplicadas **solo por número**. Los números del módulo son estos:

| Nº | Nombre | Qué hace |
|---|---|---|
| 2 | `fiscal_ecf` | tablas base: `secuencia_ncf`, `comprobante_fiscal`, enlace en `factura` |
| 11 | `ecf_dgii` | `comprobante_fiscal`: `fecha_firma`, `xml_firmado`, `motivo_rechazo`; tabla `ncf_anulacion` |
| 12 | `ecf_entrega_receptor` | entrega del e-CF al comprador (`entrega_estado`, `acuse_recibo_xml`…) |
| 13 | `comprobante_receptor_nombre` | `comprobante_fiscal.receptor_nombre` |
| 14 | `comprobante_de_compra_respaldo` | paso 1 de 3: respaldo de `comprobante_fiscal` |
| 15 | `comprobante_de_compra_tabla` | paso 2 de 3: tabla nueva con `compra_id`, `factura_id` opcional, índice único |
| 16 | `comprobante_de_compra_restaurar` | paso 3 de 3: restaura filas y enlaces |
| 17 | `negocio_ubicacion` | `negocio.municipio`, `negocio.provincia` |

Si este repo ya usa alguno de esos números para **otra cosa**, no copies la migración con ese número: renumera la del módulo
a un número libre, conservando el orden relativo entre ellas (14 → 15 → 16 deben ir seguidas), y actualiza lo que dependa.
Un caso real: otro fork tenía un `11` llamado `censo_columnas_compartido`, y esta app nunca llegó a crear `fecha_firma`.
Las migraciones 14 a 16 existen porque el driver de escritorio (`tauri-plugin-sql`) ejecuta cada sentencia sola y sin
transacción: no las unas en una sola. Después de portarlas, actualiza también `packages/api/db/schema.sql` y mantén
pasando la prueba `packages/api/test/esquema.test.ts` (compara migraciones y esquema de Postgres).

### Más advertencias

- Si en esta máquina hay otra app de escritorio con el mismo identificador (`do.facturacion.sistema`) y el archivo
  `sfr.db`, se pisan las bases de datos. Compruébalo antes de abrir la app (`%APPDATA%\do.facturacion.sistema\`) y haz
  un respaldo de esa carpeta entera antes de ejecutar nada contra ese archivo.
- Las pantallas nuevas no se han revisado nunca en un navegador. Revísalas a 375, 768 y 1440 px.
- Nada se ha enviado a la DGII real todavía.

## Secretos — reglas estrictas

- **Nunca me pidas ni aceptes el .p12 ni su contraseña ni llaves de Supabase en el chat.** Tampoco los escribas en ningún
  archivo versionado. Los valores van en `.env` (ignorado por git) o en las variables de entorno del hosting, y los
  pego yo.
- Si necesitas comprobar el certificado, dame comandos para ejecutar yo en mi terminal con la contraseña oculta; yo
  te devuelvo solo los datos no secretos (titular, SN, vencimiento).
- Si el hosting es Render y yo ya tengo el servicio, no lo recrees: pregúntame primero qué existe.

## Después de portar (o si era el caso A)

1. Revisa `PLAN.md`, sección 5 ("Lo que falta"): certificado → `/health` con `fiscal.disponible: true` → solicitud
   FI-GDF-016 → postulación → set de pruebas con `pnpm --filter @sfr/api set-pruebas`.
2. Dime qué está construido, qué falta y qué decisiones necesitas de mí. No sigas con la certificación real (`--enviar`,
   ambiente distinto de `testecf`) sin mi confirmación explícita.
3. Al terminar cada tarea no trivial, dame el informe: archivos tocados, pruebas añadidas y estado de la suite,
   lo que dejaste sin hacer y por qué.
