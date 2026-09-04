import { useEffect, useState, useCallback, useRef } from "react";
import {
  type Producto,
  type Proveedor,
  type Compra,
  type CompraLinea,
  type ComprobanteArchivo,
  type ImpuestoTipo,
} from "@sfr/core";
import { Truck, Star, Sparkles } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c, money } from "../estilos.js";
import { analizarComprobante, type DatosExtraidosComprobante } from "../data/chatbotCliente.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { filtrarNumero } from "../utilidades/numero.js";
import { mensajeError } from "../utilidades/errores.js";

interface LineaLocal {
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  costoUnitario: number;
  impuestoTipo: ImpuestoTipo;
  tasaImpuesto: number;
}

function hoyIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function leerArchivoComoBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Compras (§ Compras e inventario, con archivado): registrar una compra y consultar el historial. */
export function Compras() {
  const { compra: repo, proveedor: proveedores, producto: productos, comprobanteArchivo: archivos } = useRepos();

  // --- Formulario de nueva compra --------------------------------------
  const [fecha, setFecha] = useState(hoyIso());
  const [proveedorQ, setProveedorQ] = useState("");
  const [proveedorResultados, setProveedorResultados] = useState<Proveedor[]>([]);
  const [indiceResultadoProveedor, setIndiceResultadoProveedor] = useState(-1);
  const [proveedorSel, setProveedorSel] = useState<Proveedor | null>(null);
  const [mostrarNuevoProveedor, setMostrarNuevoProveedor] = useState(false);
  const [nuevoProveedorNombre, setNuevoProveedorNombre] = useState("");

  const [ncfProveedor, setNcfProveedor] = useState("");
  const [tieneComprobanteFiscal, setTieneComprobanteFiscal] = useState(false);
  const [notas, setNotas] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [datosIA, setDatosIA] = useState<DatosExtraidosComprobante | null>(null);

  const [lineas, setLineas] = useState<LineaLocal[]>([]);
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [resultadosProducto, setResultadosProducto] = useState<Producto[]>([]);
  const [indiceResultadoProducto, setIndiceResultadoProducto] = useState(-1);
  const [mostrarSuelto, setMostrarSuelto] = useState(false);
  const [sueltoDesc, setSueltoDesc] = useState("");
  const [sueltoCosto, setSueltoCosto] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // --- Historial ---------------------------------------------------------
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [historial, setHistorial] = useState<Compra[]>([]);
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(null);
  const [lineasSel, setLineasSel] = useState<CompraLinea[]>([]);
  const [archivosSel, setArchivosSel] = useState<ComprobanteArchivo[]>([]);
  const [proveedoresPorId, setProveedoresPorId] = useState<Record<string, Proveedor>>({});

  const proveedorRef = useRef<HTMLInputElement>(null);
  const busquedaProductoRef = useRef<HTMLInputElement>(null);
  const enfocarBusquedaProducto = useCallback(() => busquedaProductoRef.current?.focus(), []);
  useAtajosTeclado({
    F10: enfocarBusquedaProducto,
    F6: () => { if (!proveedorSel) setMostrarNuevoProveedor((v) => !v); },
    "Ctrl+S": () => { if (!guardando) void guardarCompra(); },
  });

  const cargarHistorial = useCallback(async () => {
    const lista = await repo.listar({ desde: filtroDesde || null, hasta: filtroHasta || null });
    setHistorial(lista);
    const faltantes = [...new Set(lista.map((c) => c.proveedor_id).filter((id): id is string => !!id))]
      .filter((id) => !proveedoresPorId[id]);
    if (faltantes.length > 0) {
      const nuevos: Record<string, Proveedor> = {};
      for (const id of faltantes) {
        const p = await proveedores.obtener(id);
        if (p) nuevos[id] = p;
      }
      setProveedoresPorId((prev) => ({ ...prev, ...nuevos }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, proveedores, filtroDesde, filtroHasta]);

  useEffect(() => { void cargarHistorial(); }, [cargarHistorial]);

  useEffect(() => {
    if (!seleccionadaId) return;
    void repo.obtenerLineas(seleccionadaId).then(setLineasSel);
    void archivos.obtenerPorCompra(seleccionadaId).then(setArchivosSel);
  }, [repo, archivos, seleccionadaId]);

  async function buscarProveedor(q: string) {
    setProveedorQ(q);
    setProveedorResultados(q.trim() ? await proveedores.listar(q) : []);
    setIndiceResultadoProveedor(-1);
  }

  async function crearProveedorRapido() {
    if (!nuevoProveedorNombre.trim()) return;
    try {
      const p = await proveedores.crear({ nombre: nuevoProveedorNombre });
      setProveedorSel(p);
      setMostrarNuevoProveedor(false);
      setNuevoProveedorNombre("");
      setProveedorQ("");
      setProveedorResultados([]);
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  async function buscarProducto(q: string) {
    setBusquedaProducto(q);
    setResultadosProducto(q.trim() ? await productos.listar(q) : []);
    setIndiceResultadoProducto(-1);
  }

  function agregarLineaProducto(p: Producto) {
    setLineas((prev) => [...prev, {
      producto_id: p.id, descripcion: p.descripcion, cantidad: 1,
      costoUnitario: p.costo, impuestoTipo: p.impuesto_tipo, tasaImpuesto: p.tasa_impuesto,
    }]);
    setBusquedaProducto("");
    setResultadosProducto([]);
  }

  function agregarLineaSuelta() {
    if (!sueltoDesc.trim()) return;
    setLineas((prev) => [...prev, {
      producto_id: null, descripcion: sueltoDesc, cantidad: 1,
      costoUnitario: Number(sueltoCosto) || 0, impuestoTipo: "itbis18", tasaImpuesto: 0.18,
    }]);
    setSueltoDesc("");
    setSueltoCosto("");
    setMostrarSuelto(false);
  }

  function actualizarLinea(i: number, cambio: Partial<LineaLocal>) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...cambio } : l)));
  }

  function quitarLinea(i: number) {
    setLineas((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total = lineas.reduce((acc, l) => acc + l.cantidad * l.costoUnitario, 0);

  async function analizarConIA() {
    if (!archivo) return;
    setErrorIA(null);
    setDatosIA(null);
    setAnalizando(true);
    try {
      const base64 = await leerArchivoComoBase64(archivo);
      const datos = await analizarComprobante({ data: base64, tipoMime: archivo.type || "image/jpeg" });
      setDatosIA(datos);
      // Solo se rellenan campos que mapean 1:1 al formulario. Los renglones
      // de la compra NO se generan automáticamente — la herramienta solo lee
      // el encabezado de la factura (proveedor/NCF/monto total), nunca los
      // artículos. El usuario siempre revisa antes de guardar.
      if (datos.ncf) setNcfProveedor(datos.ncf);
      setTieneComprobanteFiscal(datos.clasificacion === "con_fiscal");
      if (datos.proveedor) setProveedorQ(datos.proveedor);
      if (datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) setFecha(datos.fecha);
    } catch (e) {
      setErrorIA(mensajeError(e));
    } finally {
      setAnalizando(false);
    }
  }

  function limpiarFormulario() {
    setFecha(hoyIso());
    setProveedorSel(null);
    setNcfProveedor("");
    setTieneComprobanteFiscal(false);
    setNotas("");
    setArchivo(null);
    setDatosIA(null);
    setErrorIA(null);
    setLineas([]);
  }

  async function guardarCompra() {
    setError(null);
    setMensaje(null);
    if (lineas.length === 0) {
      setError("Agrega al menos un artículo.");
      return;
    }
    setGuardando(true);
    try {
      const nueva = await repo.crear({
        // Sin "Z": una fecha-hora "flotante" en hora local, para que tanto
        // SQLite (date(fecha)) como `new Date(...)` al mostrarla coincidan con
        // el día que el usuario eligió, sin el corrimiento de interpretarla en UTC.
        fecha: `${fecha}T12:00:00.000`,
        proveedor_id: proveedorSel?.id ?? null,
        ncf_proveedor: ncfProveedor.trim() || null,
        tieneComprobanteFiscal,
        notas: notas.trim() || null,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          descripcion: l.descripcion,
          cantidad: l.cantidad,
          costoUnitario: l.costoUnitario,
          impuestoTipo: l.impuestoTipo,
          tasaImpuesto: l.tasaImpuesto,
        })),
      });

      if (archivo) {
        const base64 = await leerArchivoComoBase64(archivo);
        await archivos.crear({
          compraId: nueva.id,
          nombreArchivo: archivo.name,
          tipoMime: archivo.type || "application/octet-stream",
          contenidoBase64: base64,
          mesAno: nueva.mes_ano_contable,
          tieneFiscal: tieneComprobanteFiscal,
        });
      }

      setMensaje("Compra registrada.");
      limpiarFormulario();
      await cargarHistorial();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  const seleccionada = historial.find((h) => h.id === seleccionadaId) ?? null;

  return (
    <div>
      <div style={{ ...s.tarjeta, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}><Truck size={18} /> Nueva compra</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={s.label}>Fecha</label>
            <input style={s.input} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Proveedor (opcional)</label>
            {proveedorSel ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>{proveedorSel.nombre}</span>
                <button style={s.botonSecundario} onClick={() => setProveedorSel(null)}>Quitar</button>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6 }}>
                  <input ref={proveedorRef} style={s.input} placeholder="Buscar proveedor…" value={proveedorQ}
                    autoFocus
                    onChange={(e) => void buscarProveedor(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && proveedorResultados.length > 0) {
                        e.preventDefault();
                        setIndiceResultadoProveedor((i) => {
                          const siguiente = e.key === "ArrowDown" ? i + 1 : i - 1;
                          return Math.min(Math.max(siguiente, 0), proveedorResultados.length - 1);
                        });
                        return;
                      }
                      if (e.key === "Enter" && indiceResultadoProveedor >= 0 && proveedorResultados[indiceResultadoProveedor]) {
                        const p = proveedorResultados[indiceResultadoProveedor];
                        setProveedorSel(p); setProveedorQ(""); setProveedorResultados([]);
                      }
                    }} />
                  <button style={s.botonSecundario} onClick={() => setMostrarNuevoProveedor((v) => !v)}>+ Nuevo (F6)</button>
                </div>
                {proveedorResultados.map((p, i) => (
                  <div key={p.id} className="sfr-fila-clickeable"
                    onClick={() => { setProveedorSel(p); setProveedorQ(""); setProveedorResultados([]); }}
                    onMouseEnter={() => setIndiceResultadoProveedor(i)}
                    style={{ padding: "6px 8px", cursor: "pointer", fontSize: 14, borderRadius: 6, ...(i === indiceResultadoProveedor ? { background: c.seleccion } : {}) }}>
                    {p.nombre}
                  </div>
                ))}
                {mostrarNuevoProveedor && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <input autoFocus style={s.input} placeholder="Nombre del proveedor" value={nuevoProveedorNombre}
                      onChange={(e) => setNuevoProveedorNombre(e.target.value)} />
                    <button style={s.boton} onClick={crearProveedorRapido}>Crear</button>
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <label style={s.label}>NCF del proveedor (opcional)</label>
            <input style={s.input} value={ncfProveedor} onChange={(e) => setNcfProveedor(e.target.value)} />
          </div>
        </div>

        <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={tieneComprobanteFiscal} onChange={(e) => setTieneComprobanteFiscal(e.target.checked)} />
          Tiene comprobante fiscal
        </label>

        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={busquedaProductoRef} style={s.input} placeholder="Buscar producto para agregar a la compra… (F10)" value={busquedaProducto}
            onChange={(e) => void buscarProducto(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if ((e.key === "ArrowDown" || e.key === "ArrowUp") && resultadosProducto.length > 0) {
                e.preventDefault();
                setIndiceResultadoProducto((i) => {
                  const siguiente = e.key === "ArrowDown" ? i + 1 : i - 1;
                  return Math.min(Math.max(siguiente, 0), resultadosProducto.length - 1);
                });
                return;
              }
              if (e.key === "Enter" && indiceResultadoProducto >= 0 && resultadosProducto[indiceResultadoProducto]) {
                agregarLineaProducto(resultadosProducto[indiceResultadoProducto]);
              }
            }} />
          <button style={s.botonSecundario} onClick={() => setMostrarSuelto((v) => !v)}>+ Producto nuevo</button>
        </div>
        {resultadosProducto.length > 0 && (
          <div style={{ marginTop: 8, border: `1px solid ${c.borde}`, borderRadius: 8, overflow: "hidden" }}>
            {resultadosProducto.map((p, i) => (
              <div key={p.id} className="sfr-fila-clickeable" onClick={() => agregarLineaProducto(p)}
                onMouseEnter={() => setIndiceResultadoProducto(i)}
                style={{ padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${c.borde}`, display: "flex", justifyContent: "space-between", ...(i === indiceResultadoProducto ? { background: c.seleccion } : {}) }}>
                <span>{p.favorito === 1 && <span title="Favorito" style={{ color: c.amarillo, marginRight: 4, display: "inline-flex", verticalAlign: "middle" }}><Star size={12} fill="currentColor" /></span>}{p.descripcion} {p.codigo_barra ? <span style={{ color: c.gris, fontSize: 12 }}>({p.codigo_barra})</span> : ""}</span>
                <span style={{ color: c.gris, fontVariantNumeric: "tabular-nums" }}>costo actual RD$ {money(p.costo)}</span>
              </div>
            ))}
          </div>
        )}
        {mostrarSuelto && (
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <input autoFocus style={s.input} placeholder="Descripción" value={sueltoDesc} onChange={(e) => setSueltoDesc(e.target.value)} />
            <input style={{ ...s.input, maxWidth: 140 }} placeholder="Costo unitario" type="text" inputMode="decimal" value={sueltoCosto}
              onChange={(e) => setSueltoCosto(filtrarNumero(e.target.value))} />
            <button style={s.boton} onClick={agregarLineaSuelta}>Agregar</button>
          </div>
        )}

        <table style={{ ...s.tabla, marginTop: 12 }}>
          <thead>
            <tr>
              <th scope="col" style={s.th}>Descripción</th>
              <th scope="col" style={s.th}>Cantidad</th>
              <th scope="col" style={s.th}>Costo unitario</th>
              <th scope="col" style={s.th}>Subtotal</th>
              <th scope="col" style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {lineas.length === 0 && (
              <tr><td style={s.filaVacia} colSpan={5}>Sin artículos. Busca un producto o agrega uno nuevo arriba.</td></tr>
            )}
            {lineas.map((l, i) => (
              <tr key={i}>
                <td style={s.td}>
                  {l.descripcion}
                  {!l.producto_id && <span style={{ ...s.badge, marginLeft: 6, background: c.amarilloFondo, color: c.amarillo }}>no registrado</span>}
                </td>
                <td style={s.td}>
                  <input style={{ ...s.input, width: 70 }} type="text" inputMode="decimal" value={l.cantidad}
                    onChange={(e) => actualizarLinea(i, { cantidad: Number(filtrarNumero(e.target.value)) || 0 })} />
                </td>
                <td style={s.td}>
                  <input style={{ ...s.input, width: 100 }} type="text" inputMode="decimal" value={l.costoUnitario}
                    onChange={(e) => actualizarLinea(i, { costoUnitario: Number(filtrarNumero(e.target.value)) || 0 })} />
                </td>
                <td style={s.tdDerecha}>RD$ {money(l.cantidad * l.costoUnitario)}</td>
                <td style={s.td}><button className="sfr-peligro" style={s.botonPeligro} onClick={() => quitarLinea(i)}>Borrar</button></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 20, fontWeight: 700, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.borde}`, fontVariantNumeric: "tabular-nums" }}>
          Total: RD$ {money(total)}
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={s.label}>Adjuntar comprobante (foto o PDF, opcional)</label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="file" accept="image/*,.pdf" onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null);
              setDatosIA(null);
              setErrorIA(null);
            }} />
            {archivo && archivo.type.startsWith("image/") && (
              <button type="button" style={{ ...s.botonSecundario, display: "inline-flex", alignItems: "center", gap: 6 }} disabled={analizando} onClick={() => void analizarConIA()}>
                {analizando ? "Analizando…" : <><Sparkles size={15} /> Analizar con IA</>}
              </button>
            )}
          </div>
          {errorIA && <div style={{ ...s.errorBox, marginTop: 8 }}>{errorIA}</div>}
          {datosIA && (
            <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: c.verdeFondo, border: `1px solid ${c.verde}`, fontSize: 13 }}>
              <strong>Lo que leyó la IA (revisa antes de guardar):</strong>
              <div>Proveedor: {datosIA.proveedor ?? "—"} · RNC: {datosIA.rnc ?? "—"}</div>
              <div>NCF: {datosIA.ncf ?? "—"} · Fecha: {datosIA.fecha ?? "—"}</div>
              <div>Monto: {datosIA.monto != null ? `RD$ ${money(datosIA.monto)}` : "—"} · ITBIS: {datosIA.itbis != null ? `RD$ ${money(datosIA.itbis)}` : "—"}</div>
              <div>Clasificación: {datosIA.clasificacion} · Confianza: {datosIA.confianza}</div>
              {datosIA.notas && <div style={{ marginTop: 4, fontStyle: "italic" }}>Nota: {datosIA.notas}</div>}
              <div style={{ marginTop: 4, color: c.gris }}>
                Se rellenaron NCF/fecha/clasificación arriba. Los artículos de la compra hay que agregarlos manualmente.
              </div>
            </div>
          )}
        </div>

        <label style={s.label}>Notas</label>
        <textarea style={{ ...s.input, minHeight: 50 }} value={notas} onChange={(e) => setNotas(e.target.value)} />

        {error && <div role="alert" style={s.errorBox}>{error}</div>}
        {mensaje && <div style={{ ...s.errorBox, background: c.verdeFondo, borderColor: c.verde, color: c.verde }}>{mensaje}</div>}

        <div style={s.formFooter}>
          <button style={s.boton} disabled={guardando} onClick={guardarCompra}>
            Guardar compra (Ctrl+S)
          </button>
        </div>
      </div>

      <div style={{ ...s.tarjeta, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={s.label}>Desde</label>
            <input style={s.input} type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Hasta</label>
            <input style={s.input} type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: seleccionada ? "1fr 340px" : "1fr", gap: 16 }}>
        <div style={s.tarjeta}>
          <table style={s.tabla}>
            <thead>
              <tr>
                <th scope="col" style={s.th}>Fecha</th>
                <th scope="col" style={s.th}>Proveedor</th>
                <th scope="col" style={s.th}>Clasificación</th>
                <th scope="col" style={s.th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {historial.length === 0 && (
                <tr><td style={s.filaVacia} colSpan={4}>No hay compras registradas para este período.</td></tr>
              )}
              {historial.map((h) => (
                <tr key={h.id} onClick={() => setSeleccionadaId(h.id)}
                  style={{ cursor: "pointer", background: h.id === seleccionadaId ? c.azulClaro : undefined }}>
                  <td style={s.td}>{new Date(h.fecha).toLocaleDateString("es-DO")}</td>
                  <td style={s.td}>{h.proveedor_id ? (proveedoresPorId[h.proveedor_id]?.nombre ?? "—") : "—"}</td>
                  <td style={s.td}><span style={s.badge}>{h.estado_clasificacion}</span></td>
                  <td style={s.tdDerecha}>RD$ {money(h.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {seleccionada && (
          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}><Truck size={16} /> Compra del {new Date(seleccionada.fecha).toLocaleDateString("es-DO")}</h4>
            {seleccionada.ncf_proveedor && <p style={{ margin: "4px 0", fontSize: 13 }}>NCF proveedor: {seleccionada.ncf_proveedor}</p>}
            <table style={{ ...s.tabla, marginTop: 8 }}>
              <tbody>
                {lineasSel.map((l) => (
                  <tr key={l.id}>
                    <td style={s.td}>{l.descripcion} × {l.cantidad}</td>
                    <td style={s.tdDerecha}>RD$ {money(l.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, borderTop: `1px solid ${c.borde}`, paddingTop: 8, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
              <span>Total</span><span>RD$ {money(seleccionada.total)}</span>
            </div>

            {archivosSel.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <label style={s.label}>Comprobante adjunto</label>
                {archivosSel.map((a) => (
                  <div key={a.id}>
                    <a href={`data:${a.tipo_mime};base64,${a.contenido_base64}`} download={a.nombre_archivo} style={{ color: c.azul, fontSize: 13 }}>
                      {a.nombre_archivo}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
