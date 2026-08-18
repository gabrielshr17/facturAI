import { type Producto, type ProductoInput, type ImpuestoTipo, type TipoVenta, tasaDe, pctGananciaDesdePrecio, calcularPrecioVenta } from "@sfr/core";
import { s, money } from "../estilos.js";
import { filtrarNumero } from "../utilidades/numero.js";

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

const ETIQUETA_IMPUESTO = Object.fromEntries(IMPUESTOS.map((i) => [i.valor, i.etiqueta])) as Record<ImpuestoTipo, string>;
const ETIQUETA_TIPO_VENTA = Object.fromEntries(TIPOS_VENTA.map((t) => [t.valor, t.etiqueta])) as Record<TipoVenta, string>;
const ETIQUETA_POLITICA: Record<"bloquear" | "advertir", string> = {
  bloquear: "Bloquear la venta",
  advertir: "Advertir y permitir la venta",
};

export interface CambioProducto {
  campo: string;
  anterior: string;
  nuevo: string;
}

/** Compara un producto ya guardado contra el formulario editado y devuelve solo los campos que
 *  de verdad cambiaron — para mostrarlos en una confirmación antes de guardar (§ Productos/Ventas
 *  "Modificar"). Nada de lógica de guardado acá, solo el diff en texto ya listo para mostrar. */
export function diferenciasProducto(original: Producto, form: ProductoInput): CambioProducto[] {
  const cambios: CambioProducto[] = [];
  const agregar = (campo: string, anterior: string, nuevo: string) => {
    if (anterior !== nuevo) cambios.push({ campo, anterior, nuevo });
  };
  agregar("Descripción", original.descripcion, (form.descripcion ?? "").trim());
  // "" y null se tratan igual a ambos lados ("sin dato") — si no, un producto guardado con "" (en
  // vez de null) se ve como si el código/unidad hubieran "cambiado" a lo mismo que ya tenían.
  agregar("Código de barra", original.codigo_barra?.trim() || "(ninguno)", form.codigo_barra?.trim() || "(ninguno)");
  agregar("Tipo de venta", ETIQUETA_TIPO_VENTA[original.tipo_venta], ETIQUETA_TIPO_VENTA[form.tipo_venta ?? "unidad"]);
  agregar("Unidad de medida", original.unidad_medida?.trim() || "(ninguna)", form.unidad_medida?.trim() || "(ninguna)");
  agregar("Costo", money(original.costo), money(form.costo ?? 0));
  agregar("% Ganancia", `${original.pct_ganancia}%`, `${form.pct_ganancia ?? 0}%`);
  agregar("Precio venta", money(original.precio_venta), form.precio_venta != null ? money(form.precio_venta) : "(automático)");
  agregar(
    "Precio mayoreo",
    original.precio_mayoreo != null ? money(original.precio_mayoreo) : "(ninguno)",
    form.precio_mayoreo != null ? money(form.precio_mayoreo) : "(ninguno)",
  );
  agregar("Impuesto", ETIQUETA_IMPUESTO[original.impuesto_tipo], ETIQUETA_IMPUESTO[form.impuesto_tipo ?? "itbis18"]);
  agregar(
    "Si se agota la existencia",
    ETIQUETA_POLITICA[original.politica_sin_existencia],
    ETIQUETA_POLITICA[form.politica_sin_existencia ?? "advertir"],
  );
  return cambios;
}

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
            type="text"
            inputMode="decimal"
            value={form.costo ?? 0}
            onChange={(e) => {
              const costo = Number(filtrarNumero(e.target.value)) || 0;
              // Costo, % Ganancia e Impuesto son los "insumos" de la fórmula — cualquiera de los
              // tres recalcula el precio en vivo. Precio venta pasa a ser el insumo (y % Ganancia
              // el reflejo) solo cuando se escribe directamente ahí abajo — así cambiar la ganancia
              // sí mueve el precio, en vez de quedarse pegado al que tenía al abrir el formulario.
              const tasa = tasaDe(form.impuesto_tipo ?? "itbis18");
              const precio_venta = calcularPrecioVenta({ costo, pctGanancia: form.pct_ganancia ?? 0, tasaImpuesto: tasa, precioManual: null });
              onCambiar({ ...form, costo, precio_venta });
            }}
          />
        </div>
        <div>
          <label style={s.label}>% Ganancia</label>
          <input
            style={s.input}
            type="text"
            inputMode="decimal"
            value={form.pct_ganancia ?? 0}
            onChange={(e) => {
              const pct_ganancia = Number(filtrarNumero(e.target.value)) || 0;
              const tasa = tasaDe(form.impuesto_tipo ?? "itbis18");
              const precio_venta = calcularPrecioVenta({ costo: form.costo ?? 0, pctGanancia: pct_ganancia, tasaImpuesto: tasa, precioManual: null });
              onCambiar({ ...form, pct_ganancia, precio_venta });
            }}
          />
        </div>
        <div>
          <label style={s.label}>Precio venta (vacío = automático desde costo + %)</label>
          <input
            style={s.input}
            type="text"
            inputMode="decimal"
            value={form.precio_venta ?? ""}
            onChange={(e) => {
              const texto = filtrarNumero(e.target.value);
              const precio_venta = texto === "" ? null : Number(texto) || 0;
              const pct_ganancia = precio_venta != null
                ? pctGananciaDesdePrecio(form.costo ?? 0, precio_venta, tasaDe(form.impuesto_tipo ?? "itbis18"))
                : form.pct_ganancia;
              onCambiar({ ...form, precio_venta, pct_ganancia });
            }}
          />
        </div>
        <div>
          <label style={s.label}>Precio mayoreo (opcional)</label>
          <input
            style={s.input}
            type="text"
            inputMode="decimal"
            value={form.precio_mayoreo ?? ""}
            onChange={(e) => {
              const texto = filtrarNumero(e.target.value);
              onCambiar({
                ...form,
                precio_mayoreo: texto === "" ? null : Number(texto) || 0,
              });
            }}
          />
        </div>
        <div>
          <label style={s.label}>Impuesto</label>
          <select
            style={s.input}
            value={form.impuesto_tipo}
            onChange={(e) => {
              const impuesto_tipo = e.target.value as ImpuestoTipo;
              const tasa = tasaDe(impuesto_tipo);
              const precio_venta = calcularPrecioVenta({ costo: form.costo ?? 0, pctGanancia: form.pct_ganancia ?? 0, tasaImpuesto: tasa, precioManual: null });
              onCambiar({ ...form, impuesto_tipo, precio_venta });
            }}
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
