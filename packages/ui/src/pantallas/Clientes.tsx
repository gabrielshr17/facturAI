import { useCallback, useEffect, useRef, useState } from "react";
import { type Cliente, type ClienteInput, ValidacionError } from "@sfr/core";
import { User } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";
import { useAlertas } from "../contexto/Alertas.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { moverIndiceFila, moverAccionFila } from "../utilidades/navegacionFilas.js";

const VACIO: ClienteInput = {
  nombre: "",
  apellidos: "",
  telefono: "",
  correo: "",
  direccion: "",
  documento_tipo: null,
  documento_numero: "",
  aplica_credito: false,
};

export function Clientes() {
  const { cliente: repo } = useRepos();
  const { confirmar } = useAlertas();
  const [lista, setLista] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<ClienteInput | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  type AccionCliente = "editar" | "eliminar";
  const [indiceFila, setIndiceFila] = useState(-1);
  const [accionFila, setAccionFila] = useState<AccionCliente | "fila">("fila");

  const busquedaRef = useRef<HTMLInputElement>(null);
  const enfocarBusqueda = useCallback(() => busquedaRef.current?.focus(), []);
  useAtajosTeclado({
    F10: enfocarBusqueda,
    F6: () => nuevo(),
    "Ctrl+S": () => { if (form) void guardar(); },
    Escape: () => { if (form) setForm(null); },
  });

  async function recargar(filtro = q) {
    setLista(await repo.listar(filtro));
  }
  useEffect(() => {
    void recargar("");
  }, []);
  useEffect(() => {
    setIndiceFila(-1);
    setAccionFila("fila");
  }, [q]);

  function dispararAccion(cl: Cliente, accion: AccionCliente) {
    if (accion === "editar") editar(cl);
    else void eliminar(cl);
  }

  function nuevo() {
    setEditando(null);
    setForm({ ...VACIO });
    setErrores([]);
  }
  function editar(cl: Cliente) {
    setEditando(cl);
    setForm({
      nombre: cl.nombre,
      apellidos: cl.apellidos ?? "",
      telefono: cl.telefono ?? "",
      correo: cl.correo ?? "",
      direccion: cl.direccion ?? "",
      documento_tipo: cl.documento_tipo,
      documento_numero: cl.documento_numero ?? "",
      aplica_credito: cl.aplica_credito === 1,
    });
    setErrores([]);
  }

  async function guardar() {
    if (!form) return;
    try {
      const limpio: ClienteInput = {
        ...form,
        documento_tipo: form.documento_numero ? form.documento_tipo : null,
      };
      if (editando) await repo.actualizar(editando.id, limpio);
      else await repo.crear(limpio);
      setForm(null);
      setEditando(null);
      await recargar();
    } catch (e) {
      if (e instanceof ValidacionError) setErrores(e.errores.map((x) => x.mensaje));
      else setErrores([String(e)]);
    }
  }

  async function eliminar(cl: Cliente) {
    if (!(await confirmar(`¿Eliminar a "${cl.nombre}"?`, { textoConfirmar: "Eliminar" }))) return;
    await repo.eliminar(cl.id);
    await recargar();
  }

  // El input de búsqueda ya navega la tabla con flechas en su propio onKeyDown (§ abajo) mientras
  // tiene el foco — pero en cuanto el foco se va a otro lado (clic en un botón, en la tabla, o en
  // ningún lado) esas flechas dejaban de hacer cualquier cosa. Este listener cubre exactamente ESE
  // caso: solo actúa cuando NO hay un campo de texto enfocado, así nunca compite con lo que el input
  // ya resuelve (que corre primero de todas formas, por cómo React delega los eventos) ni con
  // `useNavegacionFlechas` (que solo mira campos de texto).
  useEffect(() => {
    if (form) return;
    function onKeyDown(e: KeyboardEvent) {
      const activo = document.activeElement;
      if (activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement || activo instanceof HTMLSelectElement) return;

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
        dispararAccion(lista[indiceFila], accionFila);
        return;
      }
      if (e.key === "Delete" && indiceFila >= 0 && lista[indiceFila]) {
        e.preventDefault();
        dispararAccion(lista[indiceFila], "eliminar");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [form, lista, indiceFila, accionFila]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button style={s.boton} onClick={nuevo}>+ Nuevo cliente (F6)</button>
        <input
          ref={busquedaRef}
          style={{ ...s.input, maxWidth: 320 }}
          placeholder="Buscar por nombre, teléfono o correo… (F10)"
          value={q}
          autoFocus
          onChange={(e) => {
            setQ(e.target.value);
            void recargar(e.target.value);
          }}
          onKeyDown={(e) => {
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
              dispararAccion(lista[indiceFila], accionFila);
              return;
            }
            // Supr borra la fila resaltada directo, sin tener que llegar hasta "Eliminar" con → —
            // pero solo si no hay texto por borrar hacia adelante en la búsqueda (cursor al final),
            // para no comerse un borrado de texto real mientras se sigue escribiendo el filtro.
            if (e.key === "Delete" && indiceFila >= 0 && lista[indiceFila]) {
              const campo = e.currentTarget;
              if (campo.selectionStart === campo.value.length && campo.selectionEnd === campo.value.length) {
                e.preventDefault();
                dispararAccion(lista[indiceFila], "eliminar");
              }
            }
          }}
        />
        <span style={{ color: c.gris, fontSize: 13 }}>{lista.length} cliente(s)</span>
      </div>

      {form && (
        <div style={{ ...s.tarjeta, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}><User size={18} /> {editando ? "Editar cliente" : "Nuevo cliente"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={s.label}>Nombre *</label>
              <input autoFocus style={s.input} value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>Apellidos</label>
              <input style={s.input} value={form.apellidos ?? ""}
                onChange={(e) => setForm({ ...form, apellidos: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>Teléfono</label>
              <input style={s.input} value={form.telefono ?? ""}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>Correo</label>
              <input style={s.input} value={form.correo ?? ""}
                onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            </div>
            <div>
              <label style={s.label}>Dirección</label>
              <input style={s.input} value={form.direccion ?? ""}
                onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: 8 }}>
              <div>
                <label style={s.label}>Documento</label>
                <select style={s.input} value={form.documento_tipo ?? ""}
                  onChange={(e) => setForm({ ...form, documento_tipo: (e.target.value || null) as ClienteInput["documento_tipo"] })}>
                  <option value="">—</option>
                  <option value="rnc">RNC</option>
                  <option value="cedula">Cédula</option>
                </select>
              </div>
              <div>
                <label style={s.label}>Número</label>
                <input style={s.input} value={form.documento_numero ?? ""}
                  onChange={(e) => setForm({ ...form, documento_numero: e.target.value })} />
              </div>
            </div>
          </div>
          <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <input type="checkbox" checked={form.aplica_credito ?? false}
              onChange={(e) => setForm({ ...form, aplica_credito: e.target.checked })} />
            Aplica crédito
          </label>

          {errores.length > 0 && <div role="alert" style={s.errorBox}>{errores.join(" ")}</div>}

          <div style={s.formFooter}>
            <button style={s.boton} onClick={guardar}>Guardar (Ctrl+S)</button>
            <button style={s.botonSecundario} onClick={() => setForm(null)}>Cancelar (Esc)</button>
          </div>
        </div>
      )}

      <div style={s.tarjeta}>
        <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th scope="col" style={s.th}>Nombre</th>
              <th scope="col" style={s.th}>Teléfono</th>
              <th scope="col" style={s.th}>Correo</th>
              <th scope="col" style={s.th}>Documento</th>
              <th scope="col" style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td style={s.filaVacia} colSpan={5}>Sin clientes. Crea el primero con “+ Nuevo cliente”.</td></tr>
            )}
            {lista.map((cl, i) => (
              <tr
                key={cl.id}
                ref={i === indiceFila ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                style={i === indiceFila ? { background: c.seleccion } : undefined}
              >
                <td style={s.td}>{cl.nombre} {cl.apellidos ?? ""}</td>
                <td style={s.td}>{cl.telefono ?? "—"}</td>
                <td style={s.td}>{cl.correo ?? "—"}</td>
                <td style={s.td}>{cl.documento_numero ? <span style={s.badge}>{cl.documento_tipo?.toUpperCase()} {cl.documento_numero}</span> : "—"}</td>
                <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                  <button
                    style={{ ...s.botonSecundario, ...(i === indiceFila && accionFila === "editar" ? { outline: `2px solid ${c.azul}`, outlineOffset: 1 } : {}) }}
                    title="←/→ + Enter"
                    onClick={() => editar(cl)}
                  >
                    Editar
                  </button>{" "}
                  <button
                    className="sfr-peligro" style={{ ...s.botonPeligro, ...(i === indiceFila && accionFila === "eliminar" ? { outline: `2px solid ${c.azul}`, outlineOffset: 1 } : {}) }}
                    title="←/→ + Enter"
                    onClick={() => eliminar(cl)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
