import type { CSSProperties } from "react";
import { TriangleAlert } from "lucide-react";
import { s, c, sombra } from "../estilos.js";
import type { CambioProducto } from "./FormularioProducto.js";

export interface ModalConfirmarCambiosProps {
  cambios: CambioProducto[];
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Confirmación previa a guardar una edición de producto (§ Productos/Ventas "Modificar"):
 *  lista campo por campo qué va a cambiar, para no aplicar una corrección sin querer. Solo se
 *  muestra cuando `diferenciasProducto` encontró al menos un cambio real. */
export function ModalConfirmarCambios({ cambios, onConfirmar, onCancelar }: ModalConfirmarCambiosProps) {
  return (
    <div style={overlay} onClick={onCancelar}>
      <div style={tarjeta} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><TriangleAlert size={18} /> Confirmar cambios</h3>
        <p style={{ color: c.gris, fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          Se va a guardar lo siguiente:
        </p>
        <div style={{ border: `1px solid ${c.borde}`, borderRadius: 8, overflow: "hidden", maxHeight: 320, overflowY: "auto" }}>
          {cambios.map((cambio, i) => (
            <div
              key={cambio.campo}
              style={{ padding: "10px 12px", borderBottom: i < cambios.length - 1 ? `1px solid ${c.borde}` : "none" }}
            >
              <div style={{ fontSize: 12, color: c.gris, marginBottom: 3 }}>{cambio.campo}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, flexWrap: "wrap" }}>
                <span style={{ textDecoration: "line-through", color: c.gris }}>{cambio.anterior}</span>
                <span style={{ color: c.gris }}>→</span>
                <b>{cambio.nuevo}</b>
              </div>
            </div>
          ))}
        </div>
        <div style={s.formFooter}>
          <button style={s.boton} onClick={onConfirmar}>Sí, guardar (Ctrl+S)</button>
          <button style={s.botonSecundario} onClick={onCancelar}>Cancelar (Esc)</button>
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
  zIndex: 150,
};

const tarjeta: CSSProperties = {
  ...s.tarjeta,
  width: 440,
  maxWidth: "90vw",
  maxHeight: "80dvh",
  overflow: "auto",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
};
