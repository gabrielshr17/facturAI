import { useState, type CSSProperties } from "react";
import {
  emitirComprobanteDeCompra,
  ETIQUETA_TIPO_ECF,
  type Compra,
  type CompraLinea,
  type ComprobanteFiscal,
  type EmisorFiscal,
  type Proveedor,
  type TipoEcfDeCompra,
} from "@sfr/core";
import { FileCheck } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { armarRetenciones, tiposDisponibles, type EntradaRetencion } from "../data/comprobanteCompra.js";
import { s, c, sombra, money } from "../estilos.js";
import { filtrarNumero } from "../utilidades/numero.js";
import { mensajeError } from "../utilidades/errores.js";

export interface ModalComprobanteCompraProps {
  compra: Compra;
  lineas: CompraLinea[];
  proveedor: Proveedor | null;
  emisor: EmisorFiscal | null;
  onCerrar: () => void;
  onEmitida: () => void;
}

const DESCRIPCION: Record<TipoEcfDeCompra, string> = {
  "41": "Compra a un proveedor que no entrega comprobante fiscal. Puede llevar retención de ITBIS e ISR.",
  "43": "Gasto menor sin comprobante del proveedor. No lleva comprador ni ITBIS.",
  "47": "Pago a un proveedor del exterior. Lleva el ISR retenido de cada artículo.",
};

const ENTRADA_INICIAL: EntradaRetencion = { esServicio: false, itbisRetenido: "", isrRetenido: "" };

export function ModalComprobanteCompra({
  compra,
  lineas,
  proveedor,
  emisor,
  onCerrar,
  onEmitida,
}: ModalComprobanteCompraProps) {
  const {
    compra: compraRepo,
    proveedor: proveedorRepo,
    secuenciaNcf,
    comprobanteFiscal,
    ncfAnulacion,
    proveedorFiscal,
  } = useRepos();
  const opciones = tiposDisponibles(lineas, proveedor);
  const primeraDisponible = opciones.find((o) => o.motivoNoDisponible === null)?.tipo ?? null;
  const [elegido, setElegido] = useState<TipoEcfDeCompra | null>(null);
  const tipo = opciones.find((o) => o.tipo === elegido && o.motivoNoDisponible === null)?.tipo ?? primeraDisponible;
  const [entradas, setEntradas] = useState<Record<string, EntradaRetencion>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [emitido, setEmitido] = useState<ComprobanteFiscal | null>(null);

  function entradaDe(lineaId: string): EntradaRetencion {
    return entradas[lineaId] ?? ENTRADA_INICIAL;
  }

  function cambiar(lineaId: string, cambio: Partial<EntradaRetencion>) {
    setEntradas((prev) => ({ ...prev, [lineaId]: { ...(prev[lineaId] ?? ENTRADA_INICIAL), ...cambio } }));
  }

  async function emitir() {
    if (!tipo) return;
    setError(null);
    setGuardando(true);
    try {
      const { comprobante } = await emitirComprobanteDeCompra(
        {
          compraRepo,
          proveedorRepo,
          secuenciaRepo: secuenciaNcf,
          comprobanteRepo: comprobanteFiscal,
          anulacionRepo: ncfAnulacion,
          proveedorFiscal,
        },
        { compraId: compra.id, tipoEcf: tipo, retenciones: armarRetenciones(tipo, lineas, entradas) },
        emisor,
      );
      setEmitido(comprobante);
      onEmitida();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  function cerrar() {
    if (!guardando) onCerrar();
  }

  const pideRetenciones = tipo === "41" || tipo === "47";

  return (
    <div style={overlay} onClick={cerrar}>
      <div style={tarjeta} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <FileCheck size={18} /> Comprobante fiscal de la compra
        </h3>
        <p style={{ color: c.gris, fontSize: 13 }}>
          Compra del {new Date(compra.fecha).toLocaleDateString("es-DO")} por RD$ {money(compra.total)}
          {proveedor ? ` · ${proveedor.nombre}` : ""}
        </p>

        {!emitido && (
          <>
            <label style={s.label}>Tipo de comprobante</label>
            {opciones.map((o) => (
              <label key={o.tipo} style={{ ...opcion, opacity: o.motivoNoDisponible ? 0.55 : 1 }}>
                <input
                  type="radio"
                  name="tipoComprobanteCompra"
                  checked={tipo === o.tipo}
                  disabled={o.motivoNoDisponible !== null}
                  onChange={() => setElegido(o.tipo)}
                />
                <span>
                  <strong>{ETIQUETA_TIPO_ECF[o.tipo]}</strong>
                  <br />
                  <span style={{ fontSize: 13, color: c.gris }}>{o.motivoNoDisponible ?? DESCRIPCION[o.tipo]}</span>
                </span>
              </label>
            ))}

            {pideRetenciones && (
              <>
                <label style={{ ...s.label, marginTop: 12 }}>Retenciones por artículo</label>
                <p style={{ color: c.gris, fontSize: 13, margin: "0 0 8px" }}>
                  Escriba los montos retenidos en RD$. No se calculan solos: confírmelos con su contador.
                </p>
                {lineas.map((l) => {
                  const entrada = entradaDe(l.id);
                  return (
                    <div key={l.id} style={bloqueLinea}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span>
                          {l.descripcion} × {l.cantidad}
                        </span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {money(l.subtotal)}</span>
                      </div>
                      <label style={casilla}>
                        <input
                          type="checkbox"
                          checked={entrada.esServicio}
                          onChange={(e) => cambiar(l.id, { esServicio: e.target.checked })}
                        />
                        Es un servicio
                      </label>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {tipo === "41" && (
                          <div style={{ flex: 1, minWidth: 130 }}>
                            <label style={s.label}>ITBIS retenido</label>
                            <input
                              style={s.input}
                              type="text"
                              inputMode="decimal"
                              disabled={l.tasa_impuesto === 0}
                              value={entrada.itbisRetenido}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => cambiar(l.id, { itbisRetenido: filtrarNumero(e.target.value) })}
                            />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 130 }}>
                          <label style={s.label}>ISR retenido</label>
                          <input
                            style={s.input}
                            type="text"
                            inputMode="decimal"
                            disabled={!entrada.esServicio}
                            value={entrada.isrRetenido}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => cambiar(l.id, { isrRetenido: filtrarNumero(e.target.value) })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

        {error && (
          <div role="alert" style={s.errorBox}>
            {error}
          </div>
        )}
        {emitido && (
          <div style={{ ...s.errorBox, background: c.verdeFondo, borderColor: c.verde, color: c.verde }}>
            {ETIQUETA_TIPO_ECF[emitido.tipo_ecf]} {emitido.ncf} emitido por RD$ {money(emitido.total)}.
          </div>
        )}

        <div style={s.formFooter}>
          {!emitido && (
            <button style={s.boton} disabled={guardando || !tipo} onClick={() => void emitir()}>
              {guardando ? "Emitiendo…" : "Emitir comprobante"}
            </button>
          )}
          <button style={s.botonSecundario} disabled={guardando} onClick={cerrar}>
            {emitido ? "Cerrar" : "Cancelar"}
          </button>
        </div>
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
  width: 520,
  maxWidth: "92vw",
  maxHeight: "88dvh",
  overflow: "auto",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
};

const opcion: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  minHeight: 44,
  padding: "8px 0",
};

const bloqueLinea: CSSProperties = {
  border: `1px solid ${c.borde}`,
  borderRadius: 8,
  padding: 10,
  marginBottom: 8,
};

const casilla: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 44,
};
