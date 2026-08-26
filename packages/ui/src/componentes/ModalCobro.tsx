import { useState, type CSSProperties } from "react";
import { type MetodoPago, type TipoEcf, ETIQUETA_TIPO_ECF, tipoEcfSugerido, procesarCobro } from "@sfr/core";
import { CreditCard } from "lucide-react";
import { s, c, sombra, money } from "../estilos.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { filtrarNumero } from "../utilidades/numero.js";

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "credito", etiqueta: "Crédito" },
];

const TIPOS_ECF_DISPONIBLES: TipoEcf[] = ["32", "31"];

interface FilaPago {
  metodo: MetodoPago;
  monto: string;
}

export interface FiscalInput {
  tipoEcf: TipoEcf;
  receptorDocumentoTipo: "rnc" | "cedula" | null;
  receptorDocumentoNumero: string | null;
}

/** Qué hacer con el recibo al cerrar la venta: imprimirlo (térmica/GDI/navegador, § recibo.ts),
 *  guardarlo como PDF de verdad (§ impresion/pdf.ts), o nada. */
export type SalidaCobro = "imprimir" | "pdf" | "ninguna";

export interface ModalCobroProps {
  total: number;
  cantidadArticulos: number;
  notasIniciales?: string;
  /** Para prellenar el documento del receptor si el ticket ya tiene cliente asignado. */
  clienteDocumentoTipo?: "rnc" | "cedula" | null;
  clienteDocumentoNumero?: string | null;
  onCancelar: () => void;
  /** El padre hace el cobro real (repo.cobrar / cobrarConFiscal) e imprime/genera el PDF según `salida`. */
  onConfirmar: (
    pagos: { metodo: MetodoPago; monto: number }[],
    notas: string,
    salida: SalidaCobro,
    fiscal: FiscalInput | null,
  ) => Promise<void>;
}

/** Ventana de cobro (§7.2): método(s) de pago (incl. mixto), monto, cambio, y NCF opcional (§6). */
export function ModalCobro({
  total,
  cantidadArticulos,
  notasIniciales,
  clienteDocumentoTipo,
  clienteDocumentoNumero,
  onCancelar,
  onConfirmar,
}: ModalCobroProps) {
  const [filas, setFilas] = useState<FilaPago[]>([{ metodo: "efectivo", monto: total.toFixed(2) }]);
  const [notas, setNotas] = useState(notasIniciales ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emitirFiscal, setEmitirFiscal] = useState(false);
  const [tipoEcf, setTipoEcf] = useState<TipoEcf>(tipoEcfSugerido(clienteDocumentoTipo));
  const [receptorTipo, setReceptorTipo] = useState<"rnc" | "cedula">(clienteDocumentoTipo ?? "rnc");
  const [receptorNumero, setReceptorNumero] = useState(clienteDocumentoNumero ?? "");

  useAtajosTeclado({
    Escape: onCancelar,
    F1: () => { if (!guardando) void confirmar("imprimir"); },
    F2: () => { if (!guardando) void confirmar("ninguna"); },
    F3: () => { if (!guardando) void confirmar("pdf"); },
  });

  const pagos = filas.map((f) => ({ metodo: f.metodo, monto: Number(f.monto) || 0 }));
  const resultado = procesarCobro(total, pagos);

  function actualizarFila(i: number, cambio: Partial<FilaPago>) {
    setFilas((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...cambio } : f)));
  }
  function agregarFila() {
    setFilas((prev) => [...prev, { metodo: "efectivo", monto: "0" }]);
  }
  function quitarFila(i: number) {
    setFilas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function confirmar(salida: SalidaCobro) {
    setError(null);
    if (!resultado.suficiente) {
      setError(`Falta por pagar RD$ ${money(resultado.faltante)}.`);
      return;
    }
    if (emitirFiscal && tipoEcf === "31" && !receptorNumero.trim()) {
      setError("El Crédito Fiscal (E31) requiere el RNC del comprador.");
      return;
    }
    const fiscal: FiscalInput | null = emitirFiscal
      ? { tipoEcf, receptorDocumentoTipo: receptorNumero.trim() ? receptorTipo : null, receptorDocumentoNumero: receptorNumero.trim() || null }
      : null;

    setGuardando(true);
    try {
      await onConfirmar(pagos, notas, salida, fiscal);
    } catch (e) {
      setError(String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={overlay} onClick={onCancelar}>
      <div style={tarjeta} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><CreditCard size={18} /> Cobrar</h3>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, paddingBottom: 12, borderBottom: `1px solid ${c.borde}` }}>
          <span style={{ color: c.gris, fontSize: 14 }}>{cantidadArticulos} artículo(s)</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: c.texto }}>RD$ {money(total)}</span>
        </div>

        {filas.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select
              style={{ ...s.input, flex: 1 }}
              value={f.metodo}
              onChange={(e) => actualizarFila(i, { metodo: e.target.value as MetodoPago })}
            >
              {METODOS.map((m) => (
                <option key={m.valor} value={m.valor}>{m.etiqueta}</option>
              ))}
            </select>
            <input
              style={{ ...s.input, width: 120 }}
              type="text"
              inputMode="decimal"
              autoFocus={i === 0}
              onFocus={(e) => e.target.select()}
              value={f.monto}
              onChange={(e) => actualizarFila(i, { monto: filtrarNumero(e.target.value) })}
            />
            {filas.length > 1 && (
              <button style={s.botonPeligro} onClick={() => quitarFila(i)}>×</button>
            )}
          </div>
        ))}
        <button style={{ ...s.botonSecundario, marginBottom: 12 }} onClick={agregarFila}>
          + Agregar método (pago mixto)
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: c.gris, marginBottom: 8 }}>
          <span>Pagado</span><span>RD$ {money(resultado.montoPagado)}</span>
        </div>
        <div
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            fontSize: 18, fontWeight: 700, borderRadius: 8, padding: "10px 14px", marginBottom: 14,
            background: resultado.suficiente ? c.verdeFondo : c.rojoFondo,
            color: resultado.suficiente ? c.verde : c.rojo,
          }}
        >
          <span>{resultado.suficiente ? "Cambio" : "Falta"}</span>
          <span>RD$ {money(resultado.suficiente ? resultado.cambio : resultado.faltante)}</span>
        </div>

        <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={emitirFiscal} onChange={(e) => setEmitirFiscal(e.target.checked)} />
          Factura con comprobante fiscal (NCF)
        </label>
        {emitirFiscal && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <select style={{ ...s.input, flex: 1 }} value={tipoEcf} onChange={(e) => setTipoEcf(e.target.value as TipoEcf)}>
              {TIPOS_ECF_DISPONIBLES.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ECF[t]}</option>)}
            </select>
            <select style={{ ...s.input, width: 90 }} value={receptorTipo} onChange={(e) => setReceptorTipo(e.target.value as "rnc" | "cedula")}>
              <option value="rnc">RNC</option>
              <option value="cedula">Cédula</option>
            </select>
            <input
              style={{ ...s.input, flex: 1 }}
              placeholder={tipoEcf === "31" ? "RNC del comprador (obligatorio)" : "RNC/cédula (opcional)"}
              value={receptorNumero}
              onChange={(e) => setReceptorNumero(e.target.value)}
            />
          </div>
        )}

        <label style={s.label}>Notas</label>
        <textarea
          style={{ ...s.input, minHeight: 50, resize: "vertical" }}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />

        {error && <div style={s.errorBox}>{error}</div>}

        <div style={{ ...s.formFooter, flexWrap: "wrap" }}>
          <button style={s.boton} disabled={guardando} onClick={() => confirmar("imprimir")}>
            Cobrar e imprimir (F1)
          </button>
          <button style={s.botonSecundario} disabled={guardando} onClick={() => confirmar("ninguna")}>
            Cobrar sin imprimir (F2)
          </button>
          <button style={s.botonSecundario} disabled={guardando} onClick={() => confirmar("pdf")}>
            Cobrar y guardar PDF (F3)
          </button>
          <button style={s.botonSecundario} disabled={guardando} onClick={onCancelar}>
            Cancelar (Esc)
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
  width: 460,
  maxWidth: "90vw",
  maxHeight: "90vh",
  overflow: "auto",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
};
