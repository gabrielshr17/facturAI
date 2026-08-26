import { useState, type CSSProperties } from "react";
import { type FacturaLinea, type Factura, ValidacionError, calcularLinea, registrarDevolucionConFiscal } from "@sfr/core";
import { Undo2 } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c, sombra, money } from "../estilos.js";
import { filtrarNumero } from "../utilidades/numero.js";

export interface ModalDevolucionProps {
  factura: Factura;
  lineas: FacturaLinea[];
  rncEmisor: string | null;
  onCerrar: () => void;
  onCompletada: () => void;
}

/** Devolver artículos de una venta ya cobrada (§ Ventas). Si la venta es fiscal, exige emitir una Nota de Crédito (E34). */
export function ModalDevolucion({ factura, lineas, rncEmisor, onCerrar, onCompletada }: ModalDevolucionProps) {
  const { devolucion: devolucionRepo, factura: facturaRepo, secuenciaNcf, comprobanteFiscal, proveedorFiscal } = useRepos();
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  function cantidad(lineaId: string): number {
    return Number(cantidades[lineaId]) || 0;
  }

  const lineasARetornar = lineas
    .map((l) => ({ linea: l, cantidad: cantidad(l.id) }))
    .filter((x) => x.cantidad > 0);

  const totalEstimado = lineasARetornar.reduce((acc, x) => {
    const calc = calcularLinea({ precioUnitario: x.linea.precio_unitario, cantidad: x.cantidad, tasaImpuesto: x.linea.tasa_impuesto });
    return acc + calc.subtotal;
  }, 0);

  async function confirmar() {
    setError(null);
    if (lineasARetornar.length === 0) {
      setError("Indica al menos una cantidad a devolver.");
      return;
    }
    setGuardando(true);
    try {
      const input = {
        facturaId: factura.id,
        motivo: motivo.trim() || null,
        lineas: lineasARetornar.map((x) => ({ facturaLineaId: x.linea.id, cantidad: x.cantidad })),
      };
      if (factura.tipo === "fiscal") {
        await registrarDevolucionConFiscal(
          { devolucionRepo, facturaRepo, secuenciaRepo: secuenciaNcf, comprobanteRepo: comprobanteFiscal, proveedorFiscal },
          input,
          rncEmisor,
        );
      } else {
        await devolucionRepo.crear(input);
      }
      setMensaje("Devolución registrada.");
      onCompletada();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={overlay} onClick={onCerrar}>
      <div style={tarjeta} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}><Undo2 size={18} /> Devolver artículos</h3>
        <p style={{ color: c.gris, fontSize: 13 }}>
          Ticket #{factura.numero_interno}
          {factura.tipo === "fiscal" ? " — venta fiscal: se emitirá una Nota de Crédito (E34)." : ""}
        </p>

        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Artículo</th>
              <th style={s.th}>Vendido</th>
              <th style={s.th}>Devolver</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={l.id}>
                <td style={s.td}>{l.descripcion}</td>
                <td style={s.td}>{l.cantidad}</td>
                <td style={s.td}>
                  <input
                    autoFocus={i === 0}
                    onFocus={(e) => e.target.select()}
                    style={{ ...s.input, width: 70 }}
                    type="text"
                    inputMode="decimal"
                    value={cantidades[l.id] ?? "0"}
                    onChange={(e) => setCantidades((prev) => ({ ...prev, [l.id]: filtrarNumero(e.target.value) }))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, marginTop: 8 }}>
          Total estimado: RD$ {money(totalEstimado)}
        </div>

        <label style={s.label}>Motivo (opcional)</label>
        <textarea style={{ ...s.input, minHeight: 50 }} value={motivo} onChange={(e) => setMotivo(e.target.value)} />

        {error && <div style={s.errorBox}>{error}</div>}
        {mensaje && (
          <div style={{ ...s.errorBox, background: c.verdeFondo, borderColor: c.verde, color: c.verde }}>{mensaje}</div>
        )}

        <div style={s.formFooter}>
          {!mensaje && (
            <button style={s.boton} disabled={guardando} onClick={confirmar}>Confirmar devolución</button>
          )}
          <button style={s.botonSecundario} onClick={onCerrar}>{mensaje ? "Cerrar" : "Cancelar"}</button>
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
  width: 480,
  maxWidth: "90vw",
  maxHeight: "85vh",
  overflow: "auto",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
};
