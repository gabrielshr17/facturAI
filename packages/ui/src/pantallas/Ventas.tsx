import { useEffect, useState, useCallback, useRef } from "react";
import {
  type Factura,
  type FacturaLinea,
  type Producto,
  type Cliente,
  type Negocio,
  type MetodoPago,
  ValidacionError,
  cobrarConFiscal,
  aplicarDescuento,
} from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";
import { ModalCobro, type FiscalInput } from "../componentes/ModalCobro.js";
import { imprimirRecibo } from "../impresion/recibo.js";
import { abrirGavetaTermica } from "../impresion/termica.js";
import { BotonVoz } from "../componentes/BotonVoz.js";
import { ChatBot } from "../componentes/ChatBot.js";
import type { CSSProperties } from "react";

const stepperBtn: CSSProperties = {
  ...s.botonSecundario,
  width: 28,
  height: 28,
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 16,
  lineHeight: 1,
};

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Pantalla de Ventas (§7.1): construye el ticket. El cobro (§7.2, con NCF
 * opcional §6) marca la factura `cobrada` (o `fiscal` si se emite comprobante).
 */
export function Ventas() {
  const {
    factura: repo,
    producto: productos,
    cliente: clientes,
    negocio: negocioRepo,
    secuenciaNcf,
    comprobanteFiscal,
    proveedorFiscal,
    promocion: promocionRepo,
  } = useRepos();

  const [tickets, setTickets] = useState<Factura[]>([]);
  const [activoId, setActivoId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<FacturaLinea[]>([]);
  const [ahora, setAhora] = useState(new Date());

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [esMayoreo, setEsMayoreo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoAplicada, setPromoAplicada] = useState<string | null>(null);

  const [clienteQ, setClienteQ] = useState("");
  const [clienteResultados, setClienteResultados] = useState<Cliente[]>([]);
  const [clienteActivo, setClienteActivo] = useState<Cliente | null>(null);

  const [mostrarSuelto, setMostrarSuelto] = useState(false);
  const [sueltoDesc, setSueltoDesc] = useState("");
  const [sueltoPrecio, setSueltoPrecio] = useState("");
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [mostrarCobro, setMostrarCobro] = useState(false);
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [reimprimiendo, setReimprimiendo] = useState(false);

  const activo = tickets.find((t) => t.id === activoId) ?? null;

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);

  // No depende de `activoId`: usa forma funcional al fijarlo, así el repo no
  // cambia entre renders y el efecto de abajo puede correr una sola vez.
  const cargarTickets = useCallback(async () => {
    let abiertos = await repo.listarAbiertos();
    if (abiertos.length === 0) {
      await repo.abrirTicket();
      abiertos = await repo.listarAbiertos();
    }
    setTickets(abiertos);
    setActivoId((prev) => (abiertos.some((t) => t.id === prev) ? prev : abiertos[0]?.id ?? null));
  }, [repo]);

  // Guarda contra el doble-montaje de React StrictMode en desarrollo: sin este
  // guard, el efecto corre dos veces al montar y crea dos tickets abiertos.
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    cargarTickets().catch((e) => setErrorCarga(String(e)));
  }, [cargarTickets]);

  const cargarLineas = useCallback(async () => {
    if (!activoId) return setLineas([]);
    setLineas(await repo.obtenerLineas(activoId));
  }, [repo, activoId]);

  useEffect(() => {
    setError(null);
    cargarLineas().catch((e) => setErrorCarga(String(e)));
  }, [activoId]);

  useEffect(() => {
    void (async () => {
      if (activo?.cliente_id) setClienteActivo(await clientes.obtener(activo.cliente_id) ?? null);
      else setClienteActivo(null);
    })();
  }, [activo?.cliente_id]);

  useEffect(() => {
    void negocioRepo.obtener().then((n) => setNegocio(n ?? null));
  }, [negocioRepo]);

  async function refrescarTicketActivo() {
    const abiertos = await repo.listarAbiertos();
    setTickets(abiertos);
    await cargarLineas();
  }

  async function nuevoTicket() {
    const t = await repo.abrirTicket();
    setTickets((prev) => [...prev, t]);
    setActivoId(t.id);
  }

  async function eliminarTicketActivo() {
    if (!activoId) return;
    if (!confirm("¿Eliminar este ticket?")) return;
    await repo.eliminarTicket(activoId);
    setActivoId(null);
    await cargarTickets();
  }

  async function buscarProducto(q: string) {
    setBusqueda(q);
    setResultados(q.trim() ? await productos.listar(q) : []);
  }

  async function agregarProducto(p: Producto) {
    if (!activoId) return;
    setError(null);
    setPromoAplicada(null);
    const precioBase = esMayoreo && p.precio_mayoreo != null ? p.precio_mayoreo : p.precio_venta;
    try {
      const promo = await promocionRepo.obtenerAplicable(p.id, p.departamento_id, hoyIso());
      const precio = promo ? aplicarDescuento(precioBase, promo) : precioBase;
      if (promo) {
        setPromoAplicada(`Promoción aplicada: ${promo.nombre} (RD$ ${precioBase.toFixed(2)} → RD$ ${precio.toFixed(2)})`);
      }
      await repo.agregarLinea(activoId, {
        producto_id: p.id,
        descripcion: p.descripcion,
        cantidad: 1,
        precioUnitario: precio,
        esMayoreo,
        impuestoTipo: p.impuesto_tipo,
        tasaImpuesto: p.tasa_impuesto,
      });
      setBusqueda("");
      setResultados([]);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function agregarSuelto() {
    if (!activoId) return;
    setError(null);
    try {
      await repo.agregarLinea(activoId, {
        producto_id: null,
        descripcion: sueltoDesc,
        cantidad: 1,
        precioUnitario: Number(sueltoPrecio) || 0,
        impuestoTipo: "itbis18",
        tasaImpuesto: 0.18,
      });
      setSueltoDesc("");
      setSueltoPrecio("");
      setMostrarSuelto(false);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function cambiarCantidad(l: FacturaLinea, delta: number) {
    const nueva = l.cantidad + delta;
    if (nueva <= 0) return eliminarLinea(l);
    setError(null);
    try {
      await repo.actualizarCantidadLinea(l.id, nueva);
      await refrescarTicketActivo();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function eliminarLinea(l: FacturaLinea) {
    await repo.eliminarLinea(l.id);
    await refrescarTicketActivo();
  }

  async function buscarCliente(q: string) {
    setClienteQ(q);
    setClienteResultados(q.trim() ? await clientes.listar(q) : []);
  }

  async function asignarCliente(cl: Cliente | null) {
    if (!activoId) return;
    await repo.asignarCliente(activoId, cl?.id ?? null);
    setClienteActivo(cl);
    setClienteQ("");
    setClienteResultados([]);
    await refrescarTicketActivo();
  }

  const negocioReciboDefault = {
    nombre_comercial: "Mi Negocio",
    rnc: null,
    direccion: null,
    telefono: null,
    ancho_impresora_default: 80,
  };

  /** Confirma el cobro (normal o con NCF), imprime si corresponde, y libera el ticket. */
  async function confirmarCobro(
    pagos: { metodo: MetodoPago; monto: number }[],
    notas: string,
    imprimir: boolean,
    fiscal: FiscalInput | null,
  ) {
    if (!activoId) return;

    let factura: Factura;
    let comprobanteRecibo: { ncf: string; tipoEcfEtiqueta: string; codigoSeguridad?: string | null } | null = null;

    if (fiscal) {
      const resultado = await cobrarConFiscal(
        { facturaRepo: repo, secuenciaRepo: secuenciaNcf, comprobanteRepo: comprobanteFiscal, proveedorFiscal },
        activoId,
        { pagos, notas, tipoEcf: fiscal.tipoEcf, receptorDocumentoTipo: fiscal.receptorDocumentoTipo, receptorDocumentoNumero: fiscal.receptorDocumentoNumero, rncEmisor: negocio?.rnc ?? null },
      );
      factura = resultado.factura;
      comprobanteRecibo = {
        ncf: resultado.comprobante.ncf,
        tipoEcfEtiqueta: fiscal.tipoEcf === "31" ? "Crédito Fiscal (E31)" : "Consumo (E32)",
        codigoSeguridad: resultado.comprobante.codigo_seguridad,
      };
    } else {
      const resultado = await repo.cobrar(activoId, { pagos, notas });
      factura = resultado.factura;
    }

    if (imprimir) {
      imprimirRecibo({
        negocio: negocio ?? negocioReciboDefault,
        factura,
        lineas,
        pagos,
        cliente: clienteActivo,
        comprobante: comprobanteRecibo,
      });
    }
    if (pagos.some((p) => p.metodo === "efectivo")) void abrirGavetaTermica();
    setMostrarCobro(false);
    setActivoId(null);
    await cargarTickets();
  }

  /** Reimprime la última venta cobrada (§7.1). */
  async function reimprimirUltimo() {
    setReimprimiendo(true);
    try {
      const ultima = await repo.obtenerUltimaCobrada();
      if (!ultima) {
        alert("Todavía no hay ninguna venta cobrada para reimprimir.");
        return;
      }
      const [lineasUltima, pagosUltima, clienteUltima, comprobanteUltimo] = await Promise.all([
        repo.obtenerLineas(ultima.id),
        repo.obtenerPagos(ultima.id),
        ultima.cliente_id ? clientes.obtener(ultima.cliente_id) : Promise.resolve(undefined),
        ultima.comprobante_id ? comprobanteFiscal.obtener(ultima.comprobante_id) : Promise.resolve(undefined),
      ]);
      imprimirRecibo({
        negocio: negocio ?? negocioReciboDefault,
        factura: ultima,
        lineas: lineasUltima,
        pagos: pagosUltima,
        cliente: clienteUltima ?? null,
        comprobante: comprobanteUltimo
          ? {
              ncf: comprobanteUltimo.ncf,
              tipoEcfEtiqueta: comprobanteUltimo.tipo_ecf === "31" ? "Crédito Fiscal (E31)" : "Consumo (E32)",
              codigoSeguridad: comprobanteUltimo.codigo_seguridad,
            }
          : null,
      });
    } finally {
      setReimprimiendo(false);
    }
  }

  return (
    <div>
      {/* Barra de tickets abiertos + fecha/hora */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setActivoId(t.id)}
              style={{
                ...s.botonSecundario,
                borderRadius: 999,
                ...(t.id === activoId ? { background: c.azulClaro, color: c.azulOscuro, border: `1px solid ${c.azul}`, fontWeight: 600 } : {}),
              }}
            >
              Ticket #{t.numero_interno}
            </button>
          ))}
          <button style={s.botonSecundario} onClick={nuevoTicket}>+ Nuevo ticket</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button style={s.botonSecundario} disabled={reimprimiendo} onClick={reimprimirUltimo}>
            Reimprimir último ticket
          </button>
          <span style={{ color: c.gris, fontSize: 13 }}>
            {ahora.toLocaleDateString("es-DO")} {ahora.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </div>

      {errorCarga ? (
        <div style={s.errorBox}>No se pudo cargar el ticket: {errorCarga}</div>
      ) : !activo ? (
        <p style={{ color: c.gris }}>Cargando ticket…</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16 }}>
          {/* Columna principal: búsqueda + líneas */}
          <div>
            <div style={{ ...s.tarjeta, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  style={{ ...s.input, fontSize: 15, padding: "11px 14px" }}
                  placeholder="Escanear código de barra o buscar producto…"
                  value={busqueda}
                  autoFocus
                  onChange={(e) => void buscarProducto(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && busqueda.trim()) {
                      const exacto = await productos.porCodigoBarra(busqueda.trim());
                      if (exacto) void agregarProducto(exacto);
                      else if (resultados.length === 1) void agregarProducto(resultados[0]);
                    }
                  }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={esMayoreo} onChange={(e) => setEsMayoreo(e.target.checked)} />
                  Precio mayoreo
                </label>
                <BotonVoz onResultado={(texto) => void buscarProducto(texto)} />
                <button style={s.botonSecundario} onClick={() => setMostrarSuelto((v) => !v)}>
                  + Artículo no registrado
                </button>
              </div>

              {resultados.length > 0 && (
                <div style={{ marginTop: 8, border: `1px solid ${c.borde}`, borderRadius: 8, overflow: "hidden" }}>
                  {resultados.map((p) => (
                    <div
                      key={p.id}
                      className="sfr-fila-clickeable"
                      onClick={() => void agregarProducto(p)}
                      style={{ padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${c.borde}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    >
                      <span>
                        {p.descripcion} {p.codigo_barra ? <span style={{ color: c.gris, fontSize: 12 }}>({p.codigo_barra})</span> : ""}
                        {negocio?.inventario_activo === 1 && (
                          <span style={{ color: (p.existencia ?? 0) <= 0 ? c.rojo : c.gris, fontSize: 12, marginLeft: 8 }}>
                            {(p.existencia ?? 0) <= 0 ? "⚠ sin existencia" : `${p.existencia} disponibles`}
                          </span>
                        )}
                      </span>
                      <b style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {(esMayoreo && p.precio_mayoreo != null ? p.precio_mayoreo : p.precio_venta).toFixed(2)}</b>
                    </div>
                  ))}
                </div>
              )}

              {mostrarSuelto && (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <input style={s.input} placeholder="Descripción" value={sueltoDesc}
                    onChange={(e) => setSueltoDesc(e.target.value)} />
                  <input style={{ ...s.input, maxWidth: 120 }} placeholder="Precio" type="number" value={sueltoPrecio}
                    onChange={(e) => setSueltoPrecio(e.target.value)} />
                  <button style={s.boton} onClick={agregarSuelto}>Agregar</button>
                </div>
              )}

              {error && <div style={s.errorBox}>{error}</div>}
              {promoAplicada && (
                <div style={{ ...s.errorBox, background: "#f0fdf4", borderColor: c.verde, color: c.verde }}>
                  {promoAplicada}
                </div>
              )}
            </div>

            <div style={s.tarjeta}>
              <table style={s.tabla}>
                <thead>
                  <tr>
                    <th style={s.th}>Descripción</th>
                    <th style={s.th}>Cant.</th>
                    <th style={s.th}>Precio</th>
                    <th style={s.th}>Subtotal</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.length === 0 && (
                    <tr><td style={s.filaVacia} colSpan={5}>Sin artículos. Escanea o busca un producto arriba.</td></tr>
                  )}
                  {lineas.map((l) => (
                    <tr key={l.id}>
                      <td style={s.td}>
                        {l.descripcion}
                        {l.es_mayoreo ? <span style={{ ...s.badge, marginLeft: 6 }}>mayoreo</span> : ""}
                        {!l.producto_id ? <span style={{ ...s.badge, marginLeft: 6, background: "#fef3c7", color: "#92400e" }}>no registrado</span> : ""}
                      </td>
                      <td style={s.td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button style={stepperBtn} onClick={() => cambiarCantidad(l, -1)}>−</button>
                          <span style={{ minWidth: 18, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{l.cantidad}</span>
                          <button style={stepperBtn} onClick={() => cambiarCantidad(l, 1)}>+</button>
                        </div>
                      </td>
                      <td style={s.tdDerecha}>RD$ {l.precio_unitario.toFixed(2)}</td>
                      <td style={s.tdDerecha}>RD$ {l.subtotal.toFixed(2)}</td>
                      <td style={s.td}>
                        <button style={s.botonPeligro} onClick={() => eliminarLinea(l)}>Borrar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Columna lateral: cliente + totales */}
          <div>
            <div style={{ ...s.tarjeta, marginBottom: 12 }}>
              <h4 style={{ marginTop: 0 }}>👤 Cliente</h4>
              {clienteActivo ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0 }}>{clienteActivo.nombre} {clienteActivo.apellidos ?? ""}</p>
                  <button style={s.botonSecundario} onClick={() => asignarCliente(null)}>Quitar</button>
                </div>
              ) : (
                <>
                  <input style={s.input} placeholder="Buscar cliente…" value={clienteQ}
                    onChange={(e) => void buscarCliente(e.target.value)} />
                  {clienteResultados.map((cl) => (
                    <div key={cl.id} className="sfr-fila-clickeable" onClick={() => asignarCliente(cl)}
                      style={{ padding: "8px 6px", cursor: "pointer", fontSize: 14, borderRadius: 6 }}>
                      {cl.nombre} {cl.apellidos ?? ""}
                    </div>
                  ))}
                </>
              )}
            </div>

            <div style={s.tarjeta}>
              <h4 style={{ marginTop: 0 }}>💲 Totales</h4>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                <span style={{ color: c.gris }}>Gravado</span><span>RD$ {activo.subtotal_gravado.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                <span style={{ color: c.gris }}>Exento</span><span>RD$ {activo.subtotal_exento.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                <span style={{ color: c.gris }}>ITBIS</span><span>RD$ {activo.total_itbis.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 20, fontWeight: 700, borderTop: `1px solid ${c.borde}`, paddingTop: 10 }}>
                <span>Total</span><span style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {activo.total.toFixed(2)}</span>
              </div>
              <button
                style={{ ...s.boton, width: "100%", marginTop: 14, padding: "13px 18px", fontSize: 16 }}
                disabled={lineas.length === 0}
                onClick={() => setMostrarCobro(true)}
              >
                Cobrar
              </button>
              <button style={{ ...s.botonPeligro, width: "100%", marginTop: 8, border: "none", background: "none" }} onClick={eliminarTicketActivo}>
                Eliminar ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarCobro && activo && (
        <ModalCobro
          total={activo.total}
          cantidadArticulos={lineas.length}
          notasIniciales={activo.notas ?? ""}
          clienteDocumentoTipo={clienteActivo?.documento_tipo ?? null}
          clienteDocumentoNumero={clienteActivo?.documento_numero ?? null}
          onCancelar={() => setMostrarCobro(false)}
          onConfirmar={confirmarCobro}
        />
      )}

      <ChatBot />
    </div>
  );
}
