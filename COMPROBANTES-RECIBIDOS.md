# Comprobantes recibidos — lectura, clasificación y archivo

Documentación + lista de tareas de la feature. Estado: **planificación** — D2, D4, D5 decididas; D1, D3, D6 con propuesta pendiente de confirmar (§7).

## 1. Objetivo

Leer los comprobantes que el negocio **recibe** (facturas de suplidores, recibos de gastos), decidir si
son **NCF en papel** (serie `B`), **e-CF** (serie `E`) o **sin comprobante fiscal**, extraer los datos
clave y archivarlos por mes, listos para entregarlos al contable (y, más adelante, alimentar el
formato **606** de la DGII).

Entrada de imágenes:

1. Seleccionar archivo (imagen o PDF).
2. Foto directa con webcam (desktop).
3. Foto desde un teléfono (ver decisión D2).

## 2. Qué ya existe (no reinventar)

| Pieza | Dónde | Estado |
|---|---|---|
| Tabla `comprobante_archivo` (base64 inline, `mes_ano`, `tiene_fiscal`, `estado_revision`, `identificado_por`, `datos_extraidos_json`) | `packages/core/src/db/migrations.ts` (migración 5) | Existe, pensada para esta fase |
| Repo `crearComprobanteArchivoRepo` (crear / por compra / eliminar) | `packages/core/src/repos/comprobante-archivo-repo.ts` | Existe, solo ligado a `compra` |
| Adjuntar archivo + "Analizar con IA" en Compras | `packages/ui/src/pantallas/Compras.tsx` | Existe |
| Extracción con Claude visión (`analizarComprobante`) → `POST /chatbot/analizar-comprobante` | `packages/api/src/services/claude.ts`, `routes/chatbot.ts` | Existe, requiere backend + `ANTHROPIC_API_KEY` |
| Integración Gemini 2.5 Flash (JSON con esquema) | `packages/api/src/services/gemini.ts` | Existe (transferencias) |
| Tipos e-CF / NCF | `packages/core/src/dominio/ecf.ts` | Existe (emisión) — reutilizar constantes |

Brecha: la clasificación actual es `con_fiscal | sin_fiscal`, **no distingue NCF vs e-CF ni el tipo**
(crédito fiscal vs consumo), depende 100% del backend y no hay bandeja propia fuera de Compras.

## 3. Hallazgos técnicos que guían el diseño

- **La clasificación NCF vs e-CF es determinística**, no requiere IA:
  - NCF papel: `B` + tipo(2) + secuencial(8) = 11 caracteres (`B0100000123`).
  - e-CF: `E` + tipo(2) + secuencial(10) = 13 caracteres (`E310000000001`).
  - La **representación impresa del e-CF lleva un QR obligatorio** con RNC emisor, e-NCF, fecha,
    monto total y código de seguridad → decodificar el QR es mucho más fiable que OCR.
- **El tipo importa más al contable que la serie**: `B01`/`E31` (crédito fiscal, ITBIS deducible) vs
  `B02`/`E32` (consumo, no deducible), `B11`/`E41` (compras/proveedor informal), `B13`/`E43` (gastos
  menores), `B14`/`E44`, `B15`/`E45`… Se extrae y guarda el tipo, no solo "tiene/no tiene".
- **RNC y cédula tienen dígito verificador** → validar localmente descarta lecturas malas del OCR.
- **Tesseract en recibos térmicos** rinde regular sin preprocesado (escala de grises, binarizado,
  corrección de inclinación). `tesseract.js` corre en WASM en el cliente, 100% offline, pero hay que
  empaquetar `spa.traineddata` (~varios MB) para no depender de CDN.
- **DeepSeek** (a verificar en 2026): su API ha sido solo texto → sirve para *OCR → texto → LLM*, no
  para leer la imagen. Gemini Flash (ya integrado) y Claude sí leen la imagen directamente.
- **Claves de API siempre en el backend** (`packages/api`). Un LLM local (Ollama en `localhost`) no
  tiene clave, pero no es alcanzable desde un teléfono.
- **La DGII no recibe fotos de comprobantes**: recibe el **606** (TXT/Excel vía Oficina Virtual) con
  los datos de cada compra. "Enviar a la DGII" = generar el 606; al contable se le envían fotos + resumen.

## 4. Diseño propuesto (pipeline por capas, local-first)

```
captura ─► normalizar ─► hash (dedupe) ─► QR ─► OCR ─► reglas ─► [LLM opcional] ─► revisión ─► archivo
```

1. **Captura** — `<input type="file" accept="image/*,application/pdf">`; webcam vía
   `getUserMedia`; teléfono según D2.
2. **Normalizar** — rotar por EXIF, redimensionar (lado mayor ~1600 px), comprimir a WebP/JPEG.
3. **Hash SHA-256** — si ya existe, avisar "este comprobante ya fue archivado" (no duplicar).
4. **QR** (`jsQR`/`zxing-wasm`) — si decodifica una URL de consulta e-CF de DGII → e-CF con datos
   casi seguros, saltar al paso 7.
5. **OCR** (`tesseract.js`, `spa`, en Web Worker para no congelar la UI).
6. **Reglas** (`packages/core`, puro y testeable) — regex NCF/e-CF/RNC/fecha/total/ITBIS, validación de
   dígito verificador, resultado `{ serie: 'ecf'|'ncf'|'ninguno'|'dudoso', tipo, confianza, campos }`.
7. **LLM opcional** — solo si backend disponible y confianza baja o faltan campos. Interfaz
   `ProveedorExtraccion` en `packages/api` con implementaciones intercambiables (ver D3).
8. **Revisión obligatoria** — pantalla muestra imagen + campos detectados editables; el usuario
   confirma antes de archivar (requisito §8 del plan original).
9. **Archivo** — ver D4. Estructura lógica:
   `Comprobantes/AAAA-MM/{e-CF|NCF|sin-fiscal}/AAAA-MM-DD_<RNC>_<NCF>.webp`
10. **Exportar** — ver D5.

Degradación: sin backend → pasos 1–6 + 8–10 siguen funcionando; sin OCR fiable → queda
`pendiente_revision` y el usuario llena a mano. Nunca bloquea.

## 5. Modelo de datos (borrador, sujeto a D1/D4)

Nueva migración sobre `comprobante_archivo` (compatible con filas existentes):

- `serie` TEXT — `ecf|ncf|ninguno|dudoso`
- `tipo_comprobante` TEXT NULL — `B01`, `E31`, …
- `ncf` TEXT NULL, `rnc_emisor` TEXT NULL, `fecha_comprobante` TEXT NULL
- `monto_total` REAL NULL, `monto_itbis` REAL NULL
- `hash_sha256` TEXT — índice único (dedupe)
- `ruta_archivo` TEXT NULL — cuando el binario vive en disco (desktop) en vez de base64
- `origen_captura` TEXT — `archivo|webcam|telefono`
- `motor_extraccion` TEXT — `qr|ocr|llm:<proveedor>|manual`
- `exportado_en` TEXT NULL — para saber qué ya se envió al contable
- Índice único parcial `(rnc_emisor, ncf)` donde ambos no son NULL.

`contenido_base64` pasa a ser NULL-able si D4 = carpeta real.

## 6. Tareas

### Fase A — núcleo offline (sin IA)
- [ ] A1. Rama `feature/comprobantes-recibidos` desde `master`.
- [ ] A2. `packages/core/src/dominio/comprobante-recibido.ts`: regex NCF/e-CF, tipos válidos,
      validación RNC/cédula, parseo de URL del QR e-CF, clasificador → tests vitest con textos reales.
- [ ] A3. Migración + ampliar `comprobante-archivo-repo` (crear independiente de compra, listar por
      mes/serie, buscar por hash, marcar exportado) + tests.
- [ ] A4. Utilidad de imagen en `packages/ui`: normalizar, hash SHA-256 (WebCrypto).
- [ ] A5. Decodificador QR en cliente.
- [ ] A6. OCR `tesseract.js` en Web Worker, `spa.traineddata` empaquetado local (web + Tauri).
- [ ] A7. Pantalla "Comprobantes" (bandeja): captura por archivo, revisión editable, archivar, lista
      filtrable por mes/serie. Mobile-first, teclado primero (`design-guidelines.md`).
- [ ] A8. Captura por webcam (`getUserMedia`, preview, disparar, reintentar).
- [ ] A9. Desde Compras: "Crear compra desde comprobante" (prellenar) y viceversa enlazar `compra_id`.

### Fase B — IA opcional
- [ ] B1. Interfaz `ProveedorExtraccion` en `packages/api` + mover Claude a una implementación.
- [ ] B2. Implementación(es) elegidas en D3 + variables `.env.example`.
- [ ] B3. `POST /comprobantes/extraer` (texto OCR y/o imagen) con 400/501/502 explícitos.
- [ ] B4. Cliente en `packages/ui/src/data/` vía el cliente HTTP central; fallback silencioso a reglas.

### Fase C — archivo y exportación
- [ ] C1. Guardado en carpeta real (Tauri: comando Rust / `tauri-plugin-fs`), carpeta base configurable en Configuración; migrar base64 existentes a disco.
- [ ] C2. Export ZIP del mes (imágenes + `resumen.csv`).
- [ ] C3. Generar TXT del **606** a partir de los comprobantes confirmados (verificar especificación vigente de la DGII antes de codificar; validar con el contable).
- [ ] C4. Envío por correo al contable desde el backend (email del contable en Configuración; adjunto ZIP + 606).

### Fase D — teléfono (emparejamiento LAN, §7.1)
- [ ] D1. Servidor HTTP en Rust (Tauri) con ciclo de vida atado a la pantalla, token de un solo uso,
      límite de tamaño, validación de magic bytes.
- [ ] D2. Página móvil mínima de subida (cámara trasera, múltiples fotos, progreso, reintento).
- [ ] D3. Pantalla de emparejamiento con QR + lista en vivo de fotos recibidas.
- [ ] D4. Prueba en teléfono real Android + iOS en la misma Wi-Fi.

### Cierre
- [ ] Tests (`pnpm -r test`), `pnpm -r typecheck`, `pnpm lint`.
- [ ] Verificar 375 / 768 / 1440 px.
- [ ] `CHANGELOG.md` → `[Unreleased] / Added`.
- [ ] PR con plantilla.

## 7. Decisiones

| # | Tema | Estado | Decisión |
|---|---|---|---|
| D1 | Relación con Compras | Propuesta | Bandeja propia "Comprobantes" + acción "Crear compra desde comprobante" y enlace `compra_id` |
| D2 | Foto desde teléfono | **Decidido** | Emparejamiento por QR en la red local (ver §7.1) |
| D3 | Motor de IA | Propuesta | QR + Tesseract + reglas offline como motor principal; **Gemini Flash visión** (backend) como respaldo opcional; interfaz `ProveedorExtraccion` para añadir Ollama/DeepSeek después |
| D4 | Dónde se guarda | **Decidido** | Carpeta real en disco (desktop): `Documentos/facturAI/Comprobantes/AAAA-MM/{e-CF\|NCF\|sin-fiscal}/`; en BD solo ruta + hash. Web: sin carpeta, se descarga ZIP |
| D5 | Qué se entrega | **Decidido** | ZIP mensual + CSV, TXT del **606**, y envío por correo desde la app (backend) |
| D6 | Tipos de consumo (`B02`/`E32`) | Propuesta | Se archivan en la misma carpeta NCF/e-CF con el tipo registrado; el 606 los marca como no deducibles |

### 7.1 D2 — emparejamiento de teléfono por red local

1. Desktop (Tauri) levanta un servidor HTTP mínimo en Rust **solo mientras la pantalla de
   emparejamiento está abierta**, escuchando en la IP LAN y un puerto aleatorio.
2. Muestra un QR con `http://<ip-lan>:<puerto>/subir?t=<token>` — token aleatorio de un solo uso,
   expira en ~10 min.
3. El teléfono (misma Wi-Fi) abre una página mínima servida por ese servidor:
   `<input type="file" accept="image/*" capture="environment" multiple>` → sube las fotos.
4. El servidor valida token, tamaño máximo y tipo MIME (magic bytes, no solo extensión), y entrega
   la imagen al pipeline normal (bandeja → revisión en el desktop).
5. Se cierra al salir de la pantalla. Firewall de Windows pedirá permiso la primera vez.

Riesgos/notas: HTTP plano en LAN (sin TLS) — aceptable por token de un solo uso + vida corta; no
funciona si la red aísla clientes (Wi-Fi de invitados). Solo desktop (el PWA web no puede abrir un
servidor).

### 7.2 D3 — requisitos de hardware de un LLM local (referencia)

PC de desarrollo: 5.9 GB RAM, Ryzen 3 3250U, Vega 3 integrada, sin GPU dedicada.

| Opción local (Ollama) | RAM | GPU | Viabilidad en PC típica de colmado |
|---|---|---|---|
| Visión mini (~1.8B) | ~4 GB | no | 1–2 min/recibo, pobre con números |
| Visión pequeña (3–4B) | 8 GB+ | opcional | No cabe junto a la app en 6 GB |
| Visión buena (7–11B) | 16 GB+ | 8 GB+ VRAM | No viable |
| Texto ~3B sobre OCR | 6–8 GB | no | Límite; 20–60 s y depende del OCR |

Conclusión: LLM local no es viable como motor por defecto; queda como implementación opcional.

## 8. Bitácora de decisiones

- 2026-09-28 — D2: emparejamiento QR en LAN. D4: carpeta real en disco. D5: ZIP+CSV, 606 y correo.
  D3: LLM local descartado como default por hardware (ver §7.2).
