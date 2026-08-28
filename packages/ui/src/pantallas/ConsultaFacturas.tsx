import { useEffect, useState, useCallback, useRef } from "react";
import {
  type Factura,
  type FacturaLinea,
  type Pago,
  type Cliente,
  type ComprobanteFiscal,
  type Negocio,
  ETIQUETA_TIPO_ECF,
  normalizar,
} from "@sfr/core";
import { Receipt, ClipboardList } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c, money } from "../estilos.js";
import { imprimirRecibo } from "../impresion/recibo.js";
import { generarPdfRecibo, guardarPdf } from "../impresion/pdf.js";
import { ModalDevolucion } from "../componentes/ModalDevolucion.js";
import { useAlertas } from "../contexto/Alertas.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { useEsAngosto } from "../hooks/useBreakpoint.js";
import { ConsultaCotizaciones } from "./ConsultaCotizaciones.js";

/** Recorta el ruido de punto flotante antes de mostrar una cantidad (§ recibo.ts) — sin esto, un
 *  producto a granel como 3+1/3 lb se ve "3.3333333333333335". */
function cantidad(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** Fila enriquecida con los datos que no vienen directo en `factura` (§ Consulta de facturas). */
interface FilaFactura {
  factura: Factura;
  cliente: Cliente | null;
  comprobante: ComprobanteFiscal | null;
}

const TIPOS: { valor: "" | "normal" | "fiscal"; etiqueta: string }[] = [
  { valor: "", etiqueta: "Todos" },
  { valor: "normal", etiqueta: "Normal" },
  { valor: "fiscal", etiqueta: "Fiscal (NCF)" },
];

/** Consulta de facturas ya cobradas: filtrar, ver detalle y reimprimir. */
function FacturasCobradas() {
  const { factura: repo, cliente: clientes, comprobanteFiscal, negocio: negocioRepo } = useRepos();
  const { elegir } = useAlertas();
  const esAngosto = useEsAngosto();

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tipo, setTipo] = useState<"" | "normal" | "fiscal">("");
  const [busqueda, setBusqueda] = useState("");

  const [filas, setFilas] = useState<FilaFactura[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [lineasSel, setLineasSel] = useState<FacturaLinea[]>([]);
  const [pagosSel, setPagosSel] = useState<Pago[]>([]);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [mostrarDevolucion, setMostrarDevolucion] = useState(false);

  const seleccionada = filas.find((f) => f.factura.id === seleccionadaId) ?? null;

  const busquedaRef = useRef<HTMLInputElement>(null);
  const enfocarBusqueda = useCallback(() => busquedaRef.current?.focus(), []);
  useAtajosTeclado({
    F10: enfocarBusqueda,
    "Ctrl+P": () => { if (seleccionada) void reimprimir(seleccionada); },
    Escape: () => { if (mostrarDevolucion) setMostrarDevolucion(false); else setSeleccionadaId(null); },
  });

  useEffect(() => {
    void negocioRepo.obtener().then((n) => setNegocio(n ?? null));
  }, [negocioRepo]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const facturas = await repo.listarCobradas({
        desde: desde || null,
        hasta: hasta || null,
        tipo: tipo || null,
      });
      const enriquecidas = await Promise.all(
        facturas.map(async (factura) => ({
          factura,
          cliente: factura.cliente_id ? (await clientes.obtener(factura.cliente_id)) ?? null : null,
          comprobante: factura.comprobante_id
            ? (await comprobanteFiscal.obtener(factura.comprobante_id)) ?? null
            : null,
        })),
      );
      setFilas(enriquecidas);
    } catch (e) {
      setError(String(e));
    } finally {
      setCargando(false);
    }
  }, [repo, clientes, comprobanteFiscal, desde, hasta, tipo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    if (!seleccionadaId) return;
    void repo.obtenerLineas(seleccionadaId).then(setLineasSel);
    void repo.obtenerPagos(seleccionadaId).then(setPagosSel);
  }, [repo, seleccionadaId]);

  async function recargarDespuesDeDevolucion() {
    if (seleccionadaId) await repo.obtenerLineas(seleccionadaId).then(setLineasSel);
    await cargar();
  }

  const q = normalizar(busqueda);
  const filasFiltradas = q
    ? filas.filter((f) =>
        [
          String(f.factura.numero_interno ?? ""),
          f.cliente?.nombre,
          f.cliente?.apellidos,
          f.comprobante?.ncf,
        ]
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

  async function reimprimir(fila: FilaFactura) {
    const salida = await elegir("¿Cómo quieres reimprimir esta factura?", [
      { valor: "imprimir", etiqueta: "Imprimir" },
      { valor: "pdf", etiqueta: "Guardar PDF" },
    ], { titulo: "Reimprimir factura" });
    if (!salida) return;

    const datosRecibo = {
      negocio: negocio ?? negocioReciboDefault,
      factura: fila.factura,
      lineas: lineasSel,
      pagos: pagosSel,
      cliente: fila.cliente,
      comprobante: fila.comprobante
        ? {
            ncf: fila.comprobante.ncf,
            tipoEcfEtiqueta: ETIQUETA_TIPO_ECF[fila.comprobante.tipo_ecf],
            codigoSeguridad: fila.comprobante.codigo_seguridad,
          }
        : null,
    };
    if (salida === "imprimir") {
      imprimirRecibo(datosRecibo);
    } else {
      guardarPdf(generarPdfRecibo(datosRecibo), `Factura-${fila.factura.numero_interno}.pdf`);
    }
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
          <div>
            <label style={s.label}>Tipo</label>
            <select style={s.input} value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              {TIPOS.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={s.label}>Buscar (número, cliente, NCF) (F10)</label>
            <input ref={busquedaRef} style={s.input} value={busqueda} autoFocus onChange={(e) => setBusqueda(e.target.value)} />
          </div>
        </div>
        {error && <div role="alert" style={s.errorBox}>{error}</div>}
      </div>

      {/* Al angostar, el detalle deja de ser una columna al lado y pasa a apilarse debajo del listado. */}
      <div style={{ display: "grid", gridTemplateColumns: seleccionada && !esAngosto ? "minmax(0, 1fr) 340px" : "minmax(0, 1fr)", gap: 16 }}>
        <div style={s.tarjeta}>
          <div className="sfr-tabla-scroll">
          <table style={s.tabla}>
            <thead>
              <tr>
                <th scope="col" style={s.th}>#</th>
                <th scope="col" style={s.th}>Fecha</th>
                <th scope="col" style={s.th}>Cliente</th>
                <th scope="col" style={s.th}>Tipo</th>
                <th scope="col" style={s.th}>Total</th>
                <th scope="col" style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {!cargando && filasFiltradas.length === 0 && (
                <tr><td style={s.filaVacia} colSpan={6}>No hay facturas que coincidan con el filtro.</td></tr>
              )}
              {filasFiltradas.map((f) => (
                <tr
                  key={f.factura.id}
                  onClick={() => setSeleccionadaId(f.factura.id)}
                  style={{ cursor: "pointer", background: f.factura.id === seleccionadaId ? c.azulClaro : undefined }}
                >
                  <td style={s.td}>{f.factura.numero_interno}</td>
                  <td style={s.td}>{new Date(f.factura.fecha_hora).toLocaleString("es-DO", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td style={s.td}>{f.cliente ? `${f.cliente.nombre} ${f.cliente.apellidos ?? ""}` : "—"}</td>
                  <td style={s.td}>
                    <span style={s.badge}>
                      {f.factura.tipo === "fiscal" && f.comprobante
                        ? `${ETIQUETA_TIPO_ECF[f.comprobante.tipo_ecf]} · ${f.comprobante.ncf}`
                        : "Normal"}
                    </span>
                  </td>
                  <td style={s.tdDerecha}>RD$ {money(f.factura.total)}</td>
                  <td style={s.td}>
                    <button
                      style={s.botonSecundario}
                      onClick={(e) => { e.stopPropagation(); setSeleccionadaId(f.factura.id); }}
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
            <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}><Receipt size={16} /> Ticket #{seleccionada.factura.numero_interno}</h4>
            <p style={{ color: c.gris, fontSize: 13, margin: "4px 0" }}>
              {new Date(seleccionada.factura.fecha_hora).toLocaleString("es-DO")}
            </p>
            {seleccionada.cliente && (
              <p style={{ margin: "4px 0" }}>{seleccionada.cliente.nombre} {seleccionada.cliente.apellidos ?? ""}</p>
            )}
            {seleccionada.comprobante && (
              <p style={{ margin: "4px 0", fontWeight: 600 }}>
                {ETIQUETA_TIPO_ECF[seleccionada.comprobante.tipo_ecf]}<br />NCF: {seleccionada.comprobante.ncf}
              </p>
            )}

            <table style={{ ...s.tabla, marginTop: 8 }}>
              <tbody>
                {lineasSel.map((l) => (
                  <tr key={l.id}>
                    <td style={s.td}>{l.descripcion} × {cantidad(l.cantidad)}</td>
                    <td style={s.tdDerecha}>RD$ {money(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, borderTop: `1px solid ${c.borde}`, paddingTop: 8, marginTop: 8 }}>
              <span>Total</span><span>RD$ {money(seleccionada.factura.total)}</span>
            </div>

            <div style={{ marginTop: 8 }}>
              {pagosSel.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: c.gris }}>
                  <span>{p.metodo}</span><span>RD$ {money(p.monto)}</span>
                </div>
              ))}
            </div>

            <div style={s.formFooter}>
              <button style={{ ...s.boton, flex: 1 }} onClick={() => void reimprimir(seleccionada)}>
                Reimprimir (Ctrl+P)
              </button>
              <button style={{ ...s.botonSecundario, flex: 1 }} onClick={() => setMostrarDevolucion(true)}>
                Devolver
              </button>
            </div>
          </div>
        )}
      </div>

      {mostrarDevolucion && seleccionada && (
        <ModalDevolucion
          factura={seleccionada.factura}
          lineas={lineasSel}
          rncEmisor={negocio?.rnc ?? null}
          onCerrar={() => setMostrarDevolucion(false)}
          onCompletada={() => void recargarDespuesDeDevolucion()}
        />
      )}
    </div>
  );
}

/** Envuelve facturas cobradas y cotizaciones (§ ConsultaCotizaciones) en una sola pantalla con
 *  pestañas — evita sumar un décimo ítem al menú lateral, que rompería el esquema de atajos
 *  Alt+1..9 (§ AppShell). */
export function ConsultaFacturas() {
  const [tab, setTab] = useState<"facturas" | "cotizaciones">("facturas");

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <button
          onClick={() => setTab("facturas")}
          style={{
            ...s.botonSecundario,
            borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6,
            ...(tab === "facturas" ? { background: c.azulClaro, color: c.azulOscuro, border: `1px solid ${c.azul}`, fontWeight: 600 } : {}),
          }}
        >
          <Receipt size={15} /> Facturas
        </button>
        <button
          onClick={() => setTab("cotizaciones")}
          style={{
            ...s.botonSecundario,
            borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6,
            ...(tab === "cotizaciones" ? { background: c.azulClaro, color: c.azulOscuro, border: `1px solid ${c.azul}`, fontWeight: 600 } : {}),
          }}
        >
          <ClipboardList size={15} /> Cotizaciones
        </button>
      </div>
      {tab === "facturas" ? <FacturasCobradas /> : <ConsultaCotizaciones />}
    </div>
  );
}
