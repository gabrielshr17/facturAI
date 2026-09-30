# Investigación fiscal (2026-09-30)

Hallazgos de la documentación pública de la DGII y de la legislación, para decidir cómo construir lo que el
contador aún no ha confirmado. **Nada de esto sustituye la confirmación del contador.**

## ISC de alcoholes (vinos del catálogo)

- Base legal: Código Tributario (Ley 11-92), Título IV, arts. 367 y 375, modificados por la Ley 253-12 y, desde el
  18-jun-2026, por la Ley 30-26.
- **ISC específico:** un monto por litro de alcohol absoluto. Para el tercer trimestre de 2026 (jul-sep) es
  **RD$764.29 por litro de alcohol absoluto**, sin importar el grado. Hasta 2026 se ajusta por trimestre; desde 2027,
  una vez al año según la inflación. **La tasa no puede ir fija en el código: hay que poder actualizarla.**
- **ISC ad valorem:** 10% sobre el precio de venta al público (PVP), sin descuentos ni desgloses.
- Norma General 06-19 y Resolución DJU-RAD-001-2018: el ISC específico se liquida según la categoría del producto por
  su contenido de alcohol (grado alcohólico).
- En el e-CF (Formato e-CF v1.0): los ítems llevan `TablaImpuestoAdicional` con el código del impuesto (006 a 022 para
  el ISC), `CantidadReferencia`, `GradosAlcohol`, `PrecioUnitarioReferencia` (PVP) y los montos de ISC específico y
  ad valorem; los totales llevan `MontoImpuestoAdicional`. Los selectivos **sí forman parte de la base imponible del
  ITBIS**, lo que cambia el cálculo actual (hoy el ITBIS se extrae del precio).
- **Sin construir:** afecta el cálculo de cada venta de alcohol. Necesita que el contador confirme cómo se compone el
  precio de góndola (ISC + ITBIS incluidos), la categoría y el código de cada producto.

Fuentes: Norma General 06-19 (DGII); "Cambios en el ISC: alcohol, tabaco y vapeadores con la Ley 30-26"
(siemprealdia.co); Formato e-CF v1.0 (DGII).

## Comprobante rechazado

- Un e-NCF rechazado **no se reutiliza**: el comprobante no tiene validez fiscal y hay que emitir uno nuevo, con otra
  numeración, una vez corregido el error. El número rechazado se anula ante la DGII.
- Si el error lo cometió el receptor de datos (p. ej. RNC equivocado) y el comprobante ya se aceptó, se anula con una
  nota de crédito y se emite el correcto.
- El flujo de cobro ya impide cerrar una venta si la DGII rechaza el e-CF; el caso que queda es el de un comprobante
  que figuraba "en proceso" y luego resulta rechazado.

Fuentes: Guía de Facturación Electrónica y preguntas frecuentes de la DGII; siemprealdia.co ("errores al emitir e-CF").

## Retenciones (E41 y E47)

- **E41, compras a proveedores informales:** el comprador retiene el **100% del ITBIS** facturado (Norma General 05-19,
  Comprobantes Fiscales Especiales).
- **E47, pagos al exterior:** retención de **27% de ISR** sobre la renta de fuente dominicana (art. 305 del Código
  Tributario), según varias consultas técnicas de la DGII.
- **ISR en E41 (servicios de personas físicas):** no lo encontré confirmado. No se sugiere ningún valor.

Fuentes: Norma General 05-19 (DGII); Consultas Técnicas DGII sobre retención de ISR en pagos al exterior.
