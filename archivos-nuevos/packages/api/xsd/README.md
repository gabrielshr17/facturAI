# XSD oficiales DGII (e-CF v1.0)

Descargados de dgii.gov.do → Facturación Electrónica → Documentación sobre e-CF → Documentación Técnica (XSD).
Se usan en pruebas para validar el XML generado, y en tiempo de ejecución por el generador del set de
pruebas (`src/fiscal/certificacion/`) para ordenar los campos como exige la DGII.

| Archivo | Original |
|---|---|
| `ecf-31.xsd` | `e-CF 31 v.1.0.xsd` |
| `ecf-32.xsd` | `e-CF 32 v.1.0.xsd` |
| `ecf-34.xsd` | `e-CF 34 v.1.0.xsd` |
| `rfce-32.xsd` | `RFCE 32 v.1.0.xsd` |
| `ecf-33.xsd`, `ecf-41.xsd`, `ecf-43.xsd` … `ecf-47.xsd` | `e-CF NN v.1.0.xsd` |
| `anecf.xsd` | `ANECF v.1.0.xsd` |
| `acecf.xsd` | `ACECF v.1.0.xsd` |
| `arecf.xsd` | `ARECF v1.0.xsd` |

Cambios locales respecto al original:

- Se quitó el BOM UTF-8 inicial.
- `ecf-31.xsd`: el original declara `<xs:simpleType name=" IndicadorServicioTodoIncluidoType">` (con un espacio
  inicial), lo que rompe el esquema en cualquier validador estricto. Se eliminó el espacio.

Al actualizar a una versión nueva de la DGII, repetir estos ajustes si siguen aplicando.
- `rfce-32.xsd` y `acecf.xsd`: varios `pattern` usan grupos no capturantes `(?:...)` (sintaxis .NET), inválidos en XSD. Se
  reemplazaron por grupos normales `(...)`, que validan lo mismo.
