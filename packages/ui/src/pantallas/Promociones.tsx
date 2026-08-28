import { useEffect, useState } from "react";
import {
  type Promocion,
  type PromocionInput,
  type Producto,
  type Departamento,
  type TipoPromocion,
  type AplicaAPromocion,
  ValidacionError,
} from "@sfr/core";
import { Tag } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c, money } from "../estilos.js";
import { useAlertas } from "../contexto/Alertas.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { filtrarNumero } from "../utilidades/numero.js";
import { moverIndiceFila, moverAccionFila } from "../utilidades/navegacionFilas.js";

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const VACIO: PromocionInput = {
  nombre: "", tipo: "porcentaje", valor: 10, aplicaA: "producto",
  productoId: null, departamentoId: null, fechaInicio: hoyIso(), fechaFin: hoyIso(),
};

/** Promociones (§ Fase 3): descuentos por producto/departamento con vigencia, aplicados automáticamente en Ventas. */
export function Promociones() {
  const { promocion: repo, producto: productos, departamento: departamentos } = useRepos();
  const { confirmar } = useAlertas();
  const [lista, setLista] = useState<Promocion[]>([]);
  const [listaProductos, setListaProductos] = useState<Producto[]>([]);
  const [listaDepartamentos, setListaDepartamentos] = useState<Departamento[]>([]);
  const [form, setForm] = useState<PromocionInput | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  // Sin un campo de búsqueda siempre enfocado (§ Productos/Clientes) donde enganchar ↑/↓/←/→, esta
  // pantalla los escucha en `window` directamente — igual que `useAtajosTeclado` — pero solo mientras
  // no hay un formulario abierto, para no robarle las flechas a sus campos de texto/fecha.
  type AccionPromocion = "editar" | "eliminar";
  const [indiceFila, setIndiceFila] = useState(-1);
  const [accionFila, setAccionFila] = useState<AccionPromocion | "fila">("fila");

  useAtajosTeclado({
    F6: () => nueva(),
    "Ctrl+S": () => { if (form) void guardar(); },
    Escape: () => { if (form) setForm(null); },
  });

  useEffect(() => {
    if (form) return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && lista.length > 0) {
        e.preventDefault();
        setAccionFila("fila");
        setIndiceFila((i) => moverIndiceFila(i, e.key === "ArrowDown" ? 1 : -1, lista.length));
        return;
      }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && indiceFila >= 0 && lista[indiceFila]) {
        e.preventDefault();
        setAccionFila((a) => moverAccionFila(a, e.key === "ArrowRight" ? 1 : -1, ["editar", "eliminar"]));
        return;
      }
      if (e.key === "Enter" && accionFila !== "fila" && indiceFila >= 0 && lista[indiceFila]) {
        e.preventDefault();
        if (accionFila === "editar") editar(lista[indiceFila]);
        else void eliminar(lista[indiceFila]);
        return;
      }
      // Supr borra la fila resaltada directo, sin tener que llegar hasta "Eliminar" con →.
      if (e.key === "Delete" && indiceFila >= 0 && lista[indiceFila]) {
        e.preventDefault();
        void eliminar(lista[indiceFila]);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [form, lista, indiceFila, accionFila]);

  async function recargar() {
    setLista(await repo.listar());
  }
  useEffect(() => {
    void recargar();
    void productos.listar().then(setListaProductos);
    void departamentos.listar().then(setListaDepartamentos);
  }, []);

  function nueva() {
    setEditandoId(null);
    setForm({ ...VACIO });
    setErrores([]);
  }

  function editar(p: Promocion) {
    setEditandoId(p.id);
    setForm({
      nombre: p.nombre, tipo: p.tipo, valor: p.valor, aplicaA: p.aplica_a,
      productoId: p.producto_id, departamentoId: p.departamento_id,
      fechaInicio: p.fecha_inicio, fechaFin: p.fecha_fin, activa: p.activa === 1,
    });
    setErrores([]);
  }

  async function guardar() {
    if (!form) return;
    try {
      if (editandoId) await repo.actualizar(editandoId, form);
      else await repo.crear(form);
      setForm(null);
      await recargar();
    } catch (e) {
      setErrores(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje) : [String(e)]);
    }
  }

  async function eliminar(p: Promocion) {
    if (!(await confirmar(`¿Eliminar la promoción "${p.nombre}"?`, { textoConfirmar: "Eliminar" }))) return;
    await repo.eliminar(p.id);
    await recargar();
  }

  const hoy = hoyIso();

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button style={s.boton} onClick={nueva}>+ Nueva promoción (F6)</button>
      </div>

      {form && (
        <div style={{ ...s.tarjeta, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}><Tag size={18} /> {editandoId ? "Editar promoción" : "Nueva promoción"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={s.label}>Nombre *</label>
              <input autoFocus style={s.input} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>Tipo de descuento</label>
              <select style={s.input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoPromocion })}>
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="monto_fijo">Monto fijo (RD$)</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Valor</label>
              <input style={s.input} type="text" inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: Number(filtrarNumero(e.target.value)) || 0 })} />
            </div>
            <div>
              <label style={s.label}>Aplica a</label>
              <select style={s.input} value={form.aplicaA}
                onChange={(e) => setForm({ ...form, aplicaA: e.target.value as AplicaAPromocion, productoId: null, departamentoId: null })}>
                <option value="producto">Un producto</option>
                <option value="departamento">Un departamento</option>
                <option value="todo">Todo el catálogo</option>
              </select>
            </div>
            {form.aplicaA === "producto" && (
              <div>
                <label style={s.label}>Producto</label>
                <select style={s.input} value={form.productoId ?? ""} onChange={(e) => setForm({ ...form, productoId: e.target.value || null })}>
                  <option value="">Selecciona…</option>
                  {listaProductos.map((p) => <option key={p.id} value={p.id}>{p.descripcion}</option>)}
                </select>
              </div>
            )}
            {form.aplicaA === "departamento" && (
              <div>
                <label style={s.label}>Departamento</label>
                <select style={s.input} value={form.departamentoId ?? ""} onChange={(e) => setForm({ ...form, departamentoId: e.target.value || null })}>
                  <option value="">Selecciona…</option>
                  {listaDepartamentos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={s.label}>Vigente desde</label>
              <input style={s.input} type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>Vigente hasta</label>
              <input style={s.input} type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} />
            </div>
          </div>

          <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={form.activa ?? true} onChange={(e) => setForm({ ...form, activa: e.target.checked })} />
            Activa
          </label>

          {errores.length > 0 && <div role="alert" style={s.errorBox}>{errores.join(" ")}</div>}

          <div style={s.formFooter}>
            <button style={s.boton} onClick={guardar}>Guardar (Ctrl+S)</button>
            <button style={s.botonSecundario} onClick={() => setForm(null)}>Cancelar (Esc)</button>
          </div>
        </div>
      )}

      <div style={s.tarjeta}>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th scope="col" style={s.th}>Nombre</th>
              <th scope="col" style={s.th}>Descuento</th>
              <th scope="col" style={s.th}>Aplica a</th>
              <th scope="col" style={s.th}>Vigencia</th>
              <th scope="col" style={s.th}>Estado</th>
              <th scope="col" style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td style={s.filaVacia} colSpan={6}>Sin promociones. Crea la primera con "+ Nueva promoción".</td></tr>
            )}
            {lista.map((p, i) => {
              const vigente = p.activa === 1 && p.fecha_inicio <= hoy && hoy <= p.fecha_fin;
              return (
                <tr
                  key={p.id}
                  ref={i === indiceFila ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                  style={i === indiceFila ? { background: c.seleccion } : undefined}
                >
                  <td style={s.td}>{p.nombre}</td>
                  <td style={s.tdDerecha}>{p.tipo === "porcentaje" ? `${p.valor}%` : `RD$ ${money(p.valor)}`}</td>
                  <td style={s.td}>
                    {p.aplica_a === "producto"
                      ? listaProductos.find((x) => x.id === p.producto_id)?.descripcion ?? "Producto"
                      : p.aplica_a === "departamento"
                        ? listaDepartamentos.find((x) => x.id === p.departamento_id)?.nombre ?? "Departamento"
                        : "Todo el catálogo"}
                  </td>
                  <td style={s.td}>{p.fecha_inicio} – {p.fecha_fin}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: vigente ? c.verdeFondo : c.grisClaro, color: vigente ? c.verde : c.gris }}>
                      {p.activa === 0 ? "Inactiva" : vigente ? "Vigente" : "Fuera de vigencia"}
                    </span>
                  </td>
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                    <button
                      style={{ ...s.botonSecundario, ...(i === indiceFila && accionFila === "editar" ? { outline: `2px solid ${c.azul}`, outlineOffset: 1 } : {}) }}
                      title="←/→ + Enter"
                      onClick={() => editar(p)}
                    >
                      Editar
                    </button>{" "}
                    <button
                      className="sfr-peligro" style={{ ...s.botonPeligro, ...(i === indiceFila && accionFila === "eliminar" ? { outline: `2px solid ${c.azul}`, outlineOffset: 1 } : {}) }}
                      title="←/→ + Enter"
                      onClick={() => eliminar(p)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
