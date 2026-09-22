import { useEffect, useState, useCallback, useRef } from "react";
import { type Cotizacion, type CotizacionLinea, type Cliente, type Negocio, normalizar } from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c, money } from "../estilos.js";
import { generarPdfCotizacion, guardarPdf } from "../impresion/pdf.js";
import { imprimirCotizacion } from "../impresion/cotizacion.js";
import { useAlertas } from "../contexto/Alertas.js";
import { ClipboardList } from "lucide-react";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { useEsAngosto } from "../hooks/useBreakpoint.js";
import { mensajeError } from "../utilidades/errores.js";

/** Recorta el ruido de punto flotante antes de mostrar una cantidad (§ recibo.ts) — sin esto, un
 *  producto a granel como 3+1/3 lb se ve "3.3333333333333335". */
function cantidad(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Fila enriquecida con el cliente, que no viene directo en `cotizacion` (§ Consulta de cotizaciones). */
interface FilaCotizacion {
  cotizacion: Cotizacion;
  cliente: Cliente | null;
}

const ETIQUETA_ESTADO: Record<Cotizacion["estado"], string> = {
  vigente: "Vigente",
  convertida: "Convertida en venta",
  anulada: "Anulada",
};

/** Hoy en fecha LOCAL, no UTC — con `toISOString()` una cotización se marcaría vencida (o no) un
 *  día antes/después de lo real para cualquiera al oeste de Greenwich (§ mismo bug que `hoyIso()`
 *  en Compras.tsx). */
function hoyIsoLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function estaVencida(c: Cotizacion): boolean {
  return c.estado === "vigente" && c.fecha_vencimiento < hoyIsoLocal();
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" sin pasar por `Date` — un `new Date("AAAA-MM-DD")` se interpreta
 *  como medianoche UTC, y con timezones detrás de UTC (toda América) `toLocaleDateString` muestra
 *  un día antes del que en verdad es. */
function formatearFechaIso(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Consulta de cotizaciones: filtrar, ver detalle, reimprimir/PDF y anular. Misma forma que
 *  ConsultaFacturas (§ ese archivo) pero sin pagos, comprobante fiscal ni devolución — una
 *  cotización nunca fue una venta. */
export function ConsultaCotizaciones() {
  const { cotizacion: repo, cliente: clientes, negocio: negocioRepo } = useRepos();
  const { confirmar } = useAlertas();
  const esAngosto = useEsAngosto();

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [filas, setFilas] = useState<FilaCotizacion[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [lineasSel, setLineasSel] = useState<CotizacionLinea[]>([]);
  const [negocio, setNegocio] = useState<Negocio | null>(null);

  const seleccionada = filas.find((f) => f.cotizacion.id === seleccionadaId) ?? null;

  const busquedaRef = useRef<HTMLInputElement>(null);
  const enfocarBusqueda = useCallback(() => busquedaRef.current?.focus(), []);
  useAtajosTeclado({
    F10: enfocarBusqueda,
    "Ctrl+P": () => {
      if (seleccionada) descargarPdf(seleccionada);
    },
    Escape: () => setSeleccionadaId(null),
  });

  useEffect(() => {
    void negocioRepo.obtener().then((n) => setNegocio(n ?? null));
  }, [negocioRepo]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const cotizaciones = await repo.listar({ desde: desde || null, hasta: hasta || null });
      const enriquecidas = await Promise.all(
        cotizaciones.map(async (cotizacion) => ({
          cotizacion,
          cliente: cotizacion.cliente_id ? ((await clientes.obtener(cotizacion.cliente_id)) ?? null) : null,
        })),
      );
      setFilas(enriquecidas);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [repo, clientes, desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!seleccionadaId) return;
    void repo.obtenerLineas(seleccionadaId).then(setLineasSel);
  }, [repo, seleccionadaId]);

  async function anular(fila: FilaCotizacion) {
    if (!(await confirmar(`¿Anular la cotización #${fila.cotizacion.numero_interno}?`, { textoConfirmar: "Anular" })))
      return;
    await repo.anular(fila.cotizacion.id);
    await cargar();
  }

  const q = normalizar(busqueda);
  const filasFiltradas = q
    ? filas.filter((f) =>
        [String(f.cotizacion.numero_interno ?? ""), f.cliente?.nombre, f.cliente?.apellidos]
          .filter(Boolean)
          .some((campo) => normalizar(String(campo)).includes(q)),
      )
    : filas;

  const negocioReciboDefault = {
    nombre_comercial: "Mi Negocio",
    rnc: null,
    direccion: null,
    telefono: null,
    ancho_impresora_default: 80,
  };

  function datosImpresionCotizacion(fila: FilaCotizacion) {
    return {
      negocio: negocio ?? negocioReciboDefault,
      numero: fila.cotizacion.numero_interno,
      fecha: fila.cotizacion.fecha_hora,
      fechaVencimiento: fila.cotizacion.fecha_vencimiento,
      cliente: fila.cliente,
      lineas: lineasSel,
      subtotalGravado: fila.cotizacion.subtotal_gravado,
      subtotalExento: fila.cotizacion.subtotal_exento,
      totalItbis: fila.cotizacion.total_itbis,
      total: fila.cotizacion.total,
      notas: fila.cotizacion.notas,
    };
  }

  function descargarPdf(fila: FilaCotizacion) {
    guardarPdf(
      generarPdfCotizacion(datosImpresionCotizacion(fila)),
      `Cotizacion-${fila.cotizacion.numero_interno}.pdf`,
    );
  }

  function imprimir(fila: FilaCotizacion) {
    imprimirCotizacion(datosImpresionCotizacion(fila));
  }

  return (
    <div>
      <div style={{ ...s.tarjeta, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={s.label}>Desde</label>
            <input style={s.input} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Hasta</label>
            <input style={s.input} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={s.label}>Buscar (número, cliente) (F10)</label>
            <input
              ref={busquedaRef}
              style={s.input}
              value={busqueda}
              autoFocus
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <div role="alert" style={s.errorBox}>
            {error}
          </div>
        )}
      </div>

      {/* Al angostar, el detalle deja de ser una columna al lado y pasa a apilarse debajo del listado. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: seleccionada && !esAngosto ? "minmax(0, 1fr) 340px" : "minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <div style={s.tarjeta}>
          <div className="sfr-tabla-scroll">
            <table style={s.tabla}>
              <thead>
                <tr>
                  <th scope="col" style={s.th}>
                    #
                  </th>
                  <th scope="col" style={s.th}>
                    Fecha
                  </th>
                  <th scope="col" style={s.th}>
                    Cliente
                  </th>
                  <th scope="col" style={s.th}>
                    Estado
                  </th>
                  <th scope="col" style={s.th}>
                    Total
                  </th>
                  <th scope="col" style={s.th}></th>
                </tr>
              </thead>
              <tbody>
                {!cargando && filasFiltradas.length === 0 && (
                  <tr>
                    <td style={s.filaVacia} colSpan={6}>
                      No hay cotizaciones que coincidan con el filtro.
                    </td>
                  </tr>
                )}
                {filasFiltradas.map((f) => (
                  <tr
                    key={f.cotizacion.id}
                    onClick={() => setSeleccionadaId(f.cotizacion.id)}
                    style={{
                      cursor: "pointer",
                      background: f.cotizacion.id === seleccionadaId ? c.azulClaro : undefined,
                    }}
                  >
                    <td style={s.td}>{f.cotizacion.numero_interno}</td>
                    <td style={s.td}>
                      {new Date(f.cotizacion.fecha_hora).toLocaleString("es-DO", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td style={s.td}>{f.cliente ? `${f.cliente.nombre} ${f.cliente.apellidos ?? ""}` : "—"}</td>
                    <td style={s.td}>
                      <span
                        style={{
                          ...s.badge,
                          ...(estaVencida(f.cotizacion) ? { background: c.amarilloFondo, color: c.amarillo } : {}),
                        }}
                      >
                        {estaVencida(f.cotizacion) ? "Vencida" : ETIQUETA_ESTADO[f.cotizacion.estado]}
                      </span>
                    </td>
                    <td style={s.tdDerecha}>RD$ {money(f.cotizacion.total)}</td>
                    <td style={s.td}>
                      <button
                        style={s.botonSecundario}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSeleccionadaId(f.cotizacion.id);
                        }}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {seleccionada && (
          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <ClipboardList size={16} /> Cotización #{seleccionada.cotizacion.numero_interno}
            </h4>
            <p style={{ color: c.gris, fontSize: 13, margin: "4px 0" }}>
              {new Date(seleccionada.cotizacion.fecha_hora).toLocaleString("es-DO")}
            </p>
            <p style={{ color: c.gris, fontSize: 13, margin: "4px 0" }}>
              Válida hasta {formatearFechaIso(seleccionada.cotizacion.fecha_vencimiento)}
            </p>
            {seleccionada.cliente && (
              <p style={{ margin: "4px 0" }}>
                {seleccionada.cliente.nombre} {seleccionada.cliente.apellidos ?? ""}
              </p>
            )}

            <table style={{ ...s.tabla, marginTop: 8 }}>
              <tbody>
                {lineasSel.map((l) => (
                  <tr key={l.id}>
                    <td style={s.td}>
                      {l.descripcion} × {cantidad(l.cantidad)}
                    </td>
                    <td style={s.tdDerecha}>RD$ {money(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontWeight: 700,
                fontSize: 16,
                borderTop: `1px solid ${c.borde}`,
                paddingTop: 8,
                marginTop: 8,
              }}
            >
              <span>Total</span>
              <span>RD$ {money(seleccionada.cotizacion.total)}</span>
            </div>

            {seleccionada.cotizacion.notas && (
              <p style={{ fontSize: 13, color: c.gris, marginTop: 8 }}>Notas: {seleccionada.cotizacion.notas}</p>
            )}

            <div style={s.formFooter}>
              <button style={{ ...s.boton, flex: 1 }} onClick={() => imprimir(seleccionada)}>
                Imprimir
              </button>
              <button style={{ ...s.botonSecundario, flex: 1 }} onClick={() => descargarPdf(seleccionada)}>
                Guardar PDF (Ctrl+P)
              </button>
              {seleccionada.cotizacion.estado === "vigente" && (
                <button
                  className="sfr-peligro"
                  style={{ ...s.botonPeligro, flex: 1 }}
                  onClick={() => void anular(seleccionada)}
                >
                  Anular
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
