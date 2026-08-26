import { useState, type CSSProperties } from "react";
import { normalizar, ValidacionError, type ProductoInput } from "@sfr/core";
import { Upload, TriangleAlert } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c, sombra } from "../estilos.js";
import { useAlertas } from "../contexto/Alertas.js";
import { parseArchivoProductos, type ArchivoParseado } from "../importacion/parseArchivo.js";
import { adivinarMapeo, normalizarImpuesto, normalizarTipoVenta, columnaDe, ETIQUETA_CAMPO, type CampoDestino } from "../importacion/mapeo.js";

const CAMPOS: CampoDestino[] = [
  "descripcion", "codigo_barra", "costo", "precio_venta", "precio_mayoreo",
  "impuesto_tipo", "existencia", "departamento", "tipo_venta", "unidad_medida", "ignorar",
];

type Paso = "seleccion" | "mapeo" | "importando" | "resultado";

interface ResultadoImportacion {
  creados: number;
  actualizados: number;
  omitidos: number;
  errores: { fila: number; motivo: string }[];
}

function valorDeFila(
  fila: ArchivoParseado["filas"][number],
  mapeo: Record<string, CampoDestino>,
  campo: CampoDestino,
): string | number | null {
  const col = columnaDe(mapeo, campo);
  return col ? fila[col] ?? null : null;
}

/** Acepta números crudos (celdas numéricas de Excel) y texto con formato de moneda ("$162.00", "RD$1,500.00", celdas de Excel guardadas como texto). */
function aNumero(v: string | number | null): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const limpio = v.trim().replace(/^RD\$?\s?/i, "").replace(/[$\s]/g, "").replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Importa productos desde un archivo Excel (.xlsx) o CSV de otro sistema:
 * el usuario elige el archivo, mapea sus columnas a los campos del producto
 * (con un intento automático por nombre), y confirma. Detecta duplicados por
 * código de barra (opción de actualizar en vez de omitir).
 */
export function ImportarProductos({ onCerrar, onImportado }: { onCerrar: () => void; onImportado: () => void }) {
  const { producto: productos, departamento: departamentos } = useRepos();
  const { confirmar } = useAlertas();

  const [paso, setPaso] = useState<Paso>("seleccion");
  const [archivo, setArchivo] = useState<ArchivoParseado | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, CampoDestino>>({});
  const [actualizarExistentes, setActualizarExistentes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);

  async function manejarArchivo(file: File) {
    setError(null);
    try {
      const parseado = await parseArchivoProductos(file);
      if (parseado.filas.length === 0) throw new Error("El archivo no tiene filas de datos.");
      setArchivo(parseado);
      setMapeo(adivinarMapeo(parseado.columnas));
      setPaso("mapeo");
    } catch (e) {
      setError(String(e));
    }
  }

  function cambiarMapeo(columna: string, campo: CampoDestino) {
    setMapeo((prev) => ({ ...prev, [columna]: campo }));
  }

  async function ejecutarImportacion() {
    if (!archivo) return;
    if (!columnaDe(mapeo, "descripcion")) {
      setError("Debes mapear una columna a 'Descripción': es obligatoria.");
      return;
    }
    if (!columnaDe(mapeo, "precio_venta") && !columnaDe(mapeo, "costo")) {
      const continuar = await confirmar(
        "No asignaste ninguna columna a 'Precio de venta' ni 'Costo': " +
        "TODOS los productos se importarán con precio RD$0.00. " +
        "¿Seguro que quieres continuar así?",
        { textoConfirmar: "Continuar así" },
      );
      if (!continuar) return;
    }
    setError(null);
    setPaso("importando");
    setProgreso(0);

    const departamentosCache = new Map<string, string>();
    for (const d of await departamentos.listar()) departamentosCache.set(normalizar(d.nombre), d.id);

    const res: ResultadoImportacion = { creados: 0, actualizados: 0, omitidos: 0, errores: [] };

    for (let i = 0; i < archivo.filas.length; i++) {
      const fila = archivo.filas[i];
      setProgreso(i + 1);
      try {
        const descripcion = String(valorDeFila(fila, mapeo, "descripcion") ?? "").trim();
        if (!descripcion) { res.omitidos++; continue; }

        const codigoRaw = valorDeFila(fila, mapeo, "codigo_barra");
        const codigo_barra = codigoRaw != null && String(codigoRaw).trim() ? String(codigoRaw).trim() : null;

        let departamento_id: string | null = null;
        const depRaw = valorDeFila(fila, mapeo, "departamento");
        // Varios sistemas exportan la ausencia de dato como un texto tipo
        // "- Sin Departamento -" en vez de dejar la celda vacía.
        const esMarcadorVacio = (v: string) => /^-.*-$/.test(v.trim()) || v.trim() === "-";
        if (depRaw != null && String(depRaw).trim() && !esMarcadorVacio(String(depRaw))) {
          const nombreDep = String(depRaw).trim();
          const clave = normalizar(nombreDep);
          if (!departamentosCache.has(clave)) {
            const nuevo = await departamentos.crear(nombreDep);
            departamentosCache.set(clave, nuevo.id);
          }
          departamento_id = departamentosCache.get(clave) ?? null;
        }

        const unidadRaw = valorDeFila(fila, mapeo, "unidad_medida");
        const unidad_medida = unidadRaw != null && String(unidadRaw).trim() ? String(unidadRaw).trim() : null;
        // A diferencia de los demás campos, `normalizarTipoVenta` siempre devuelve un valor concreto
        // (nunca null/undefined) porque necesita un default ("unidad") para cuando la columna SÍ está
        // mapeada pero la celda viene vacía. Eso significa que `input.tipo_venta ?? actual.tipo_venta`
        // en el repo nunca caería al valor existente si mandáramos ese default también cuando la
        // columna NO está mapeada — una actualización masiva sin esa columna resetearía a "unidad"
        // hasta los productos que ya se marcaron a granel a mano. Por eso el `undefined` explícito aquí.
        const tipoVentaMapeado = columnaDe(mapeo, "tipo_venta") !== undefined;

        const input: ProductoInput = {
          descripcion,
          codigo_barra,
          costo: aNumero(valorDeFila(fila, mapeo, "costo")) ?? 0,
          precio_venta: aNumero(valorDeFila(fila, mapeo, "precio_venta")),
          precio_mayoreo: aNumero(valorDeFila(fila, mapeo, "precio_mayoreo")),
          impuesto_tipo: normalizarImpuesto(valorDeFila(fila, mapeo, "impuesto_tipo")),
          tipo_venta: tipoVentaMapeado ? normalizarTipoVenta(valorDeFila(fila, mapeo, "tipo_venta")) : undefined,
          unidad_medida,
          departamento_id,
        };
        const existencia = aNumero(valorDeFila(fila, mapeo, "existencia"));

        const existente = codigo_barra ? await productos.porCodigoBarra(codigo_barra) : undefined;
        if (existente) {
          if (!actualizarExistentes) { res.omitidos++; continue; }
          await productos.actualizar(existente.id, input);
          if (existencia != null) await productos.ajustarExistencia(existente.id, existencia);
          res.actualizados++;
        } else {
          const creado = await productos.crear(input);
          if (existencia != null) await productos.ajustarExistencia(creado.id, existencia);
          res.creados++;
        }
      } catch (e) {
        res.errores.push({
          fila: i + 2, // +1 por encabezado, +1 por índice 0-based
          motivo: e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e),
        });
      }
    }

    setResultado(res);
    setPaso("resultado");
    onImportado();
  }

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={tarjeta} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}><Upload size={18} /> Importar productos</h3>

        {paso === "seleccion" && (
          <>
            <p style={{ color: c.gris, fontSize: 14 }}>
              Selecciona un archivo Excel (.xlsx) o CSV exportado de tu otro sistema.
              En el siguiente paso podrás indicar qué columna corresponde a cada dato.
            </p>
            <input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void manejarArchivo(f); }}
            />
            {error && <div style={s.errorBox}>{error}</div>}
            <div style={s.formFooter}>
              <button style={s.botonSecundario} onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        )}

        {paso === "mapeo" && archivo && (
          <>
            <p style={{ color: c.gris, fontSize: 14 }}>
              {archivo.filas.length} fila(s) encontradas. Asigna cada columna de tu archivo a un campo
              (o "No importar"). "Descripción" es obligatoria.
            </p>
            <table style={s.tabla}>
              <thead>
                <tr>
                  <th style={s.th}>Columna del archivo</th>
                  <th style={s.th}>Se importa como</th>
                  <th style={s.th}>Ejemplo</th>
                </tr>
              </thead>
              <tbody>
                {archivo.columnas.map((col) => (
                  <tr key={col}>
                    <td style={s.td}>{col}</td>
                    <td style={s.td}>
                      <select
                        style={s.input}
                        value={mapeo[col] ?? "ignorar"}
                        onChange={(e) => cambiarMapeo(col, e.target.value as CampoDestino)}
                      >
                        {CAMPOS.map((cmp) => <option key={cmp} value={cmp}>{ETIQUETA_CAMPO[cmp]}</option>)}
                      </select>
                    </td>
                    <td style={{ ...s.td, color: c.gris, fontSize: 13 }}>
                      {String(archivo.filas[0]?.[col] ?? "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={actualizarExistentes}
                onChange={(e) => setActualizarExistentes(e.target.checked)}
              />
              Actualizar productos existentes (mismo código de barra) en vez de omitirlos
            </label>

            {!columnaDe(mapeo, "precio_venta") && !columnaDe(mapeo, "costo") && (
              <div style={{ background: c.amarilloFondo, border: `1px solid ${c.amarillo}`, color: c.amarillo, borderRadius: 8, padding: "8px 12px", fontSize: 13, marginTop: 10, display: "flex", alignItems: "flex-start", gap: 6 }}>
                <TriangleAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Ninguna columna está asignada a "Precio de venta" ni "Costo": todos los productos se
                importarán con precio RD$0.00. Revisa el mapeo si tu archivo sí tiene precios.</span>
              </div>
            )}

            {error && <div style={s.errorBox}>{error}</div>}

            <div style={s.formFooter}>
              <button style={s.boton} onClick={ejecutarImportacion}>Importar {archivo.filas.length} fila(s)</button>
              <button style={s.botonSecundario} onClick={onCerrar}>Cancelar</button>
            </div>
          </>
        )}

        {paso === "importando" && archivo && (
          <p style={{ color: c.gris }}>Importando fila {progreso} de {archivo.filas.length}…</p>
        )}

        {paso === "resultado" && resultado && (
          <>
            <div style={{ ...s.errorBox, background: c.verdeFondo, borderColor: c.verde, color: c.verde }}>
              {resultado.creados} creado(s), {resultado.actualizados} actualizado(s), {resultado.omitidos} omitido(s).
            </div>
            {resultado.errores.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p style={{ color: c.rojo, fontSize: 14, marginBottom: 4 }}>
                  {resultado.errores.length} fila(s) con error:
                </p>
                <div style={{ maxHeight: 160, overflow: "auto", fontSize: 13 }}>
                  {resultado.errores.map((e, i) => (
                    <div key={i} style={{ color: c.rojo }}>Fila {e.fila}: {e.motivo}</div>
                  ))}
                </div>
              </div>
            )}
            <div style={s.formFooter}>
              <button style={s.boton} onClick={onCerrar}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--sfr-overlay)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const tarjeta: CSSProperties = {
  ...s.tarjeta,
  width: 640,
  maxWidth: "90vw",
  maxHeight: "85vh",
  overflow: "auto",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
};
