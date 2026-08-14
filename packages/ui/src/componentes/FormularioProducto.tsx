import { type ProductoInput, type ImpuestoTipo, type TipoVenta } from "@sfr/core";
import { s } from "../estilos.js";

const IMPUESTOS: { valor: ImpuestoTipo; etiqueta: string }[] = [
  { valor: "itbis18", etiqueta: "ITBIS 18%" },
  { valor: "itbis16", etiqueta: "ITBIS 16%" },
  { valor: "exento", etiqueta: "Exento" },
];

const TIPOS_VENTA: { valor: TipoVenta; etiqueta: string }[] = [
  { valor: "unidad", etiqueta: "Por unidad" },
  { valor: "granel", etiqueta: "A granel (por peso/medida)" },
  { valor: "paquete", etiqueta: "Por paquete" },
  { valor: "kit", etiqueta: "Kit" },
];

export interface FormularioProductoProps {
  form: ProductoInput;
  onCambiar: (form: ProductoInput) => void;
  editando: boolean;
  inventarioActivo: boolean;
  errores: string[];
  onGuardar: () => void;
  onCancelar: () => void;
}

/** Campos para crear/editar un producto (§ Productos). Componente controlado sin estado propio ni
 *  llamadas al repo — así lo puede envolver tanto la pantalla Productos como el botón "Modificar"
 *  de la búsqueda en Ventas, para corregir un precio sin salir del ticket que se está armando. */
export function FormularioProducto({ form, onCambiar, editando, inventarioActivo, errores, onGuardar, onCancelar }: FormularioProductoProps) {
  return (
    <div style={{ ...s.tarjeta, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>📦 {editando ? "Editar producto" : "Nuevo producto"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={s.label}>Descripción *</label>
          <input
            autoFocus
            style={s.input}
            value={form.descripcion}
            onChange={(e) => onCambiar({ ...form, descripcion: e.target.value })}
          />
        </div>
        <div>
          <label style={s.label}>Código de barra (opcional)</label>
          <input
            style={s.input}
            value={form.codigo_barra ?? ""}
            onChange={(e) => onCambiar({ ...form, codigo_barra: e.target.value })}
          />
        </div>
        <div>
          <label style={s.label}>Tipo de venta</label>
          <select
            style={s.input}
            value={form.tipo_venta ?? "unidad"}
            onChange={(e) => onCambiar({ ...form, tipo_venta: e.target.value as TipoVenta })}
          >
            {TIPOS_VENTA.map((t) => (
              <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
            ))}
          </select>
        </div>
        {form.tipo_venta === "granel" && (
          <div>
            <label style={s.label}>Unidad de medida (ej. lb, kg, oz)</label>
            <input
              style={s.input}
              placeholder="lb"
              value={form.unidad_medida ?? ""}
              onChange={(e) => onCambiar({ ...form, unidad_medida: e.target.value })}
            />
          </div>
        )}
        <div>
          <label style={s.label}>Costo</label>
          <input
            style={s.input}
            type="number"
            value={form.costo ?? 0}
            onChange={(e) => onCambiar({ ...form, costo: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={s.label}>% Ganancia</label>
          <input
            style={s.input}
            type="number"
            value={form.pct_ganancia ?? 0}
            onChange={(e) => onCambiar({ ...form, pct_ganancia: Number(e.target.value) })}
          />
        </div>
        <div>
          <label style={s.label}>Precio venta (vacío = automático)</label>
          <input
            style={s.input}
            type="number"
            value={form.precio_venta ?? ""}
            placeholder="automático desde costo + %"
            onChange={(e) =>
              onCambiar({
                ...form,
                precio_venta: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label style={s.label}>Precio mayoreo (opcional)</label>
          <input
            style={s.input}
            type="number"
            value={form.precio_mayoreo ?? ""}
            onChange={(e) =>
              onCambiar({
                ...form,
                precio_mayoreo: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
        </div>
        <div>
          <label style={s.label}>Impuesto</label>
          <select
            style={s.input}
            value={form.impuesto_tipo}
            onChange={(e) => onCambiar({ ...form, impuesto_tipo: e.target.value as ImpuestoTipo })}
          >
            {IMPUESTOS.map((i) => (
              <option key={i.valor} value={i.valor}>{i.etiqueta}</option>
            ))}
          </select>
        </div>
        {inventarioActivo && (
          <div>
            <label style={s.label}>Si se agota la existencia</label>
            <select
              style={s.input}
              value={form.politica_sin_existencia ?? "advertir"}
              onChange={(e) => onCambiar({ ...form, politica_sin_existencia: e.target.value as "bloquear" | "advertir" })}
            >
              <option value="advertir">Advertir y permitir la venta</option>
              <option value="bloquear">Bloquear la venta</option>
            </select>
          </div>
        )}
      </div>

      {errores.length > 0 && (
        <div style={s.errorBox}>{errores.join(" ")}</div>
      )}

      <div style={s.formFooter}>
        <button style={s.boton} onClick={onGuardar}>Guardar (Ctrl+S)</button>
        <button style={s.botonSecundario} onClick={onCancelar}>Cancelar (Esc)</button>
      </div>
    </div>
  );
}
