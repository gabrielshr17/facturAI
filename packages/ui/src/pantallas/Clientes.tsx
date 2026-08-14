import { useCallback, useEffect, useRef, useState } from "react";
import { type Cliente, type ClienteInput, ValidacionError } from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";

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
  const [lista, setLista] = useState<Cliente[]>([]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [form, setForm] = useState<ClienteInput | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

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
    if (!confirm(`¿Eliminar a "${cl.nombre}"?`)) return;
    await repo.eliminar(cl.id);
    await recargar();
  }

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
        />
        <span style={{ color: c.gris, fontSize: 13 }}>{lista.length} cliente(s)</span>
      </div>

      {form && (
        <div style={{ ...s.tarjeta, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>👤 {editando ? "Editar cliente" : "Nuevo cliente"}</h3>
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

          {errores.length > 0 && <div style={s.errorBox}>{errores.join(" ")}</div>}

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
              <th style={s.th}>Nombre</th>
              <th style={s.th}>Teléfono</th>
              <th style={s.th}>Correo</th>
              <th style={s.th}>Documento</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td style={s.filaVacia} colSpan={5}>Sin clientes. Crea el primero con “+ Nuevo cliente”.</td></tr>
            )}
            {lista.map((cl) => (
              <tr key={cl.id}>
                <td style={s.td}>{cl.nombre} {cl.apellidos ?? ""}</td>
                <td style={s.td}>{cl.telefono ?? "—"}</td>
                <td style={s.td}>{cl.correo ?? "—"}</td>
                <td style={s.td}>{cl.documento_numero ? <span style={s.badge}>{cl.documento_tipo?.toUpperCase()} {cl.documento_numero}</span> : "—"}</td>
                <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                  <button style={s.botonSecundario} onClick={() => editar(cl)}>Editar</button>{" "}
                  <button style={s.botonPeligro} onClick={() => eliminar(cl)}>Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
