# Guía de certificación e-CF con la DGII

Cómo certificar facturAI como emisor electrónico ("Software de Desarrollo Propio") y qué hacer cuando algo falla. Escrita después de pasar los Pasos 2, 3 y 4 en CerteCF con el RNC 132069031. Complementa `docs/investigacion-fiscal.md` y `packages/api/DESPLIEGUE.md`.

## 1. Reglas que no se rompen

1. **Un e-CF rechazado obliga a reiniciar el set** y los números de e-NCF no se reutilizan. Se emite tipo por tipo, se comprueba cada resultado y no se reintenta a ciegas.
2. **Nada se envía a la DGII sin confirmación explícita** de quien dirige el proceso, ni siquiera en `testecf`.
3. **El certificado (.p12), su contraseña y las llaves no se pegan en chats, archivos ni git.** Van como variables de entorno del hosting o del terminal local.
4. **Simular antes de enviar.** `set-pruebas` sin `--enviar` valida contra el XSD sin tocar la DGII.
5. **Ensayar en `testecf` antes de gastar números de `certecf`.** El XSD publicado es más permisivo que el servidor de la DGII: hay rechazos que solo aparecen al enviar.

## 2. Ambientes

| Ambiente | Uso | `DGII_AMBIENTE` |
|---|---|---|
| Pre-certificación | ensayo de la app, secuencias propias | `testecf` |
| Certificación | pasos oficiales 2, 3 y 4 | `certecf` |
| Producción | ventas reales con valor fiscal | `ecf` |

El ambiente lo decide el **backend en Render** (variable `DGII_AMBIENTE`); la app solo habla con el backend. Se comprueba en `https://fe.facturaird.com/health` (`fiscal.disponible` y `fiscal.ambiente`; si es `false`, trae `fiscal.motivo`).

**Fecha de vencimiento de las secuencias: `2028-12-31`**, tanto en `testecf` como en `certecf`. Cualquier otra se rechaza con el código 145.

## 3. Requisitos antes de empezar

1. **Certificado digital** emitido a nombre del Usuario Administrador e-CF. Puede ser personal (el SN lleva la cédula del titular): en ese caso se define `DGII_CEDULA_TITULAR`.
2. **Solicitud FI-GDF-016** en la Oficina Virtual y acceso al Portal de Certificación.
3. **Backend desplegado en Render** con plan de pago (el gratuito se duerme) y dominio con SSL, con estas variables: `DGII_AMBIENTE`, `DGII_RNC_EMISOR`, `DGII_P12_BASE64`, `DGII_P12_PASSWORD`, `DGII_CEDULA_TITULAR` (si aplica), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `API_CORREOS_PERMITIDOS`.
4. **App apuntando al backend**: en `packages/web/.env` (ignorado por git) `VITE_FISCAL_MODO=dgii` y `VITE_API_URL=https://fe.facturaird.com`, más las variables de Supabase para iniciar sesión con Google.

### Cargar el certificado en Render (sin exponerlo)

En PowerShell, deja el base64 en el portapapeles sin imprimirlo y pégalo en `DGII_P12_BASE64`:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\ruta\empresa.p12")) | Set-Clipboard
```

Comprobar el SN sin compartirlo (contraseña oculta):

```powershell
$clave = Read-Host "Contraseña del p12" -AsSecureString
$c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2("C:\ruta\empresa.p12", $clave)
$c.Subject
$c.NotAfter
```

Después, `/health` debe dar `fiscal.disponible: true`. Si no, `fiscal.motivo` dice por qué:

| Código | Qué hacer |
|---|---|
| `falta-rnc` | definir `DGII_RNC_EMISOR` |
| `falta-certificado` | falta `DGII_P12_BASE64` o `DGII_P12_PASSWORD` |
| `certificado-ilegible` | contraseña incorrecta o base64 cortado; usar el `.p12` original |
| `certificado-vencido` | renovar el certificado |
| `sn-no-coincide` | el SN no contiene el RNC: definir `DGII_CEDULA_TITULAR` (certificado personal) |

## 4. Paso 1: postulación

1. En el portal, llenar el formulario: tipo `PROPIO`, nombre del software, versión y **solo el host** (`fe.facturaird.com`) en las tres URLs (recepción, aprobación comercial y autenticación).
2. **Generar archivo** descarga un XML.
3. Firmarlo en tu propia terminal (pide la contraseña sin mostrarla y no envía nada):

```
pnpm --filter @sfr/api firmar-xml "<postulacion>.xml" --p12 "<ruta al .p12>"
```

4. Subir el `<postulacion>-firmado.xml` en "Envío de archivo de postulación firmado".

El portal genera el grupo de comprobantes completo (31 al 47). La app emite los diez tipos.

## 5. Paso 2: set de pruebas (desde el Excel)

1. Descargar el Excel con **Descargar comprobantes**.
2. Variables en el terminal (la contraseña con entrada oculta):

```powershell
$env:DGII_AMBIENTE = "certecf"
$env:DGII_RNC_EMISOR = "132069031"
$env:DGII_CEDULA_TITULAR = "<cédula del titular>"
$env:DGII_P12_PATH = "C:\ruta\empresa.p12"
$env:DGII_P12_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR((Read-Host "Contraseña del p12" -AsSecureString)))
```

3. **Simulacro** (no envía): debe terminar con `0 con problemas`.

```
pnpm --filter @sfr/api set-pruebas "<excel>.xlsx" --salida "<carpeta>"
```

4. **Envío real** (con confirmación): agregar `--enviar`. Envía en el orden del portal y emite por sí solo los resúmenes (RFCE) de los consumos menores de RD$250,000.
5. **No repetir el comando después de enviar**: cada ejecución firma de nuevo y cambiaría los códigos de seguridad de los resúmenes ya aceptados.
6. Los estados `en_proceso` pasan a aceptado en minutos. Se miran en el portal ("Estado actual de las pruebas").
7. Subir a mano en el portal los e-CF íntegros de los consumos menores (los `<RNC><eNCF>.xml` de la carpeta de salida, sin el sufijo `-resumen`). El portal pide que antes estén aceptados los resúmenes.

## 6. Paso 3: aprobaciones comerciales

Igual que el Paso 2 con el Excel de aprobaciones. El envío real devuelve una respuesta que el script interpreta en `aceptada`, `rechazada` o `no_reconocida`; esta última se muestra como error con la respuesta cruda, nunca como rechazo. Si el portal avanza al siguiente paso, las aprobaciones se aceptaron.

## 7. Paso 4: simulación con la app

Aquí no hay Excel: **los comprobantes los emite la propia app** con datos de operaciones reales y se envían a CerteCF. Cantidades que pidió el portal:

| Tipo | Cantidad | Cómo se emite en la app |
|---|---|---|
| E31 crédito fiscal | 4 | Ventas, cobro fiscal, Crédito Fiscal, comprador con RNC y razón social |
| E32 consumo ≥ RD$250,000 | 2 | Ventas, cantidad suficiente (5,000 × RD$50), Consumo, comprador con RNC |
| E41 compras | 2 | Compras, proveedor con RNC, **Emitir comprobante fiscal** |
| E43 gastos menores | 2 | Compras, artículo exento, **Emitir comprobante fiscal** |
| E44 regímenes especiales | 2 | Ventas, cobro fiscal, E44 (el ITBIS se exonera; el total no cambia) |
| E45 gubernamental | 2 | Ventas, cobro fiscal, E45 |
| E46 exportaciones | 2 | Ventas, cobro fiscal, E46 (igual que E44) |
| E47 pagos al exterior | 2 | Compras, artículo exento, proveedor identificado, ISR retenido 0 |
| E33 nota de débito | 1 | Facturas, abrir un E31 aceptado, **Nota de débito** |
| E34 nota de crédito | 2 | Facturas, abrir un E31 aceptado, **Devolver** |
| E32 consumo < RD$250,000 | 4 | Ventas, total bajo, sin comprador; la app envía también el resumen |

**Orden del portal:** primero 31, 32 ≥ 250 mil, 41, 43, 44, 45, 46 y 47; después 33 y 34 (referidos a comprobantes ya aceptados de esta etapa); después los resúmenes de consumo menor; al final se suben a mano los 4 e-CF íntegros de consumo menor.

### Preparar la app

1. Servidor local: `pnpm --filter @sfr/web dev` y abrir `http://localhost:5173` en Chrome. Los datos viven en el almacenamiento de ese navegador; no limpiar los datos del sitio.
2. Iniciar sesión con Google (Configuración) con un correo incluido en `API_CORREOS_PERMITIDOS`. **La sesión caduca aproximadamente a la hora**: si aparece "Token de autenticación inválido o expirado", recargar la página y reintentar (el comprobante no llegó a la DGII; solo queda un número "por anular").
3. **Configuración, Datos del negocio**: RNC, razón social y dirección reales. El backend solo firma para el RNC configurado.
4. **Configuración, Secuencias NCF**: una por tipo, rango propio (por ejemplo `1001–1100`), vencimiento `2028-12-31`. Antes, **Cerrar** las de ensayo de ese tipo: la app usa primero la de vencimiento más cercano y, con igual fecha, la más antigua.
5. Para E41 y E47 hace falta un proveedor con RNC o cédula (campo "RNC o cédula del proveedor" al seleccionarlo). Para E43 y E47, artículos **exentos** (en "+ Producto nuevo", Impuesto = Exento).
6. Datos de comprador de prueba que acepta la DGII: RNC `131880681`, razón social `DOCUMENTOS ELECTRONICOS DE 03`.

### Enviar con seguridad

- Un comprobante a la vez; revisar el aviso verde de Ventas o, en Compras, el detalle ("DGII: aceptado").
- Los avisos muestran el estado en el momento del cobro. La confirmación definitiva es el contador del portal.
- Si algo se rechaza: **copiar el mensaje exacto y el código**, no reintentar con el mismo número y resolver la causa.

## 8. Rechazos que ya conocemos

| Código y mensaje | Causa | Solución |
|---|---|---|
| 145 Fecha de vencimiento de secuencia inválida | la secuencia se cargó con otra fecha | usar `2028-12-31` y cerrar la secuencia equivocada |
| 3 `IdDoc` incompleto, faltan `IndicadorMontoGravado, TipoPago` (E41) | el servidor exige `TipoPago` y forma de pago en E41 aunque el XSD lo marque opcional | corregido: E41 los envía; E43 y E47 no los llevan |
| 294 E47 solo permite servicio | los ítems del E47 deben ser servicios | corregido: la app los declara todos como servicio |
| 1406 `RazonSocialComprador` no válido (E34) | la nota de crédito iba sin la razón social del comprador | corregido: la nota la hereda del comprobante original |
| 1406 / 294 / 3 en el set de pruebas | columnas del Excel mal leídas | `#e` es celda vacía, `ENCF` es `eNCF`, `NumeroLineaDoR` es el número de línea del descuento |
| Token de autenticación inválido o expirado | caducó la sesión de Google de la app | recargar la página y reintentar |

## 9. Verificar con un respaldo

**Configuración, Exportar respaldo completo** baja un JSON con todos los comprobantes. Contar aceptados por tipo (cambiar la ruta y el filtro de números):

```
node -e '
const r = JSON.parse(require("fs").readFileSync("C:/ruta/respaldo.json", "utf8"));
const cf = r.tablas.comprobante_fiscal.filter((c) => !c.deleted_at && Number(c.ncf.slice(3)) >= 1001);
const t = {};
for (const c of cf) { t["E" + c.tipo_ecf] ??= { ok: 0, total: 0 }; t["E" + c.tipo_ecf].total++; if (/aceptado/.test(c.estado_dgii)) t["E" + c.tipo_ecf].ok++; }
console.log(t);
'
```

Los XML íntegros firmados están en `comprobante_fiscal.xml_firmado`. Para subir los consumos menores al portal, escribir cada uno **sin modificarlo** como `<RNC><eNCF>.xml`.

## 10. Estado y pendientes

- Pasos 2, 3 y 4 completos en CerteCF con el RNC 132069031 (25 comprobantes aceptados en el Paso 4).
- Paso 5 (representación impresa con QR de cada e-CF enviado): pendiente de documentar al hacerlo.
- Pendientes técnicos: el campo "ISR retenido" del E47 no muestra el `0` escrito; renovar el token de sesión de forma automática en el cliente.
- A confirmar con el contador antes de producción: retenciones de E41 y E47, la exoneración de ITBIS en E44 y E46 (el total del ticket no cambia) y el tratamiento de los números "por anular".
- En producción, los números gastados sin venta (los de "Números de comprobante sin venta") se anulan ante la DGII.
