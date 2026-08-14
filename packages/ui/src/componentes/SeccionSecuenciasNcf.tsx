import { useEffect, useState } from "react";
import {
  type SecuenciaNcf,
  type SecuenciaNcfInput,
  type TipoEcf,
  ETIQUETA_TIPO_ECF,
  UMBRAL_BAJO,
  ValidacionError,
} from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";

const TIPOS: TipoEcf[] = ["32", "31", "34", "33", "41", "43", "44", "45", "46", "47"];

const VACIO: SecuenciaNcfInput = { tipoEcf: "32", rangoDesde: 1, rangoHasta: 1000, vencimiento: "" };

const COLOR_ESTADO: Record<SecuenciaNcf["estado"], string> = {
  disponible: c.verde,
  agotada: c.rojo,
  vencida: c.rojo,
};

function restantes(sec: SecuenciaNcf): number {
  return Math.max(0, sec.rango_hasta - sec.proximo_numero + 1);
}

/** Configuración de secuencias NCF (§6): cargar rangos autorizados por la DGII. */
export function SeccionSecuenciasNcf() {
  const { secuenciaNcf: repo } = useRepos();
  const [lista, setLista] = useState<SecuenciaNcf[]>([]);
  const [form, setForm] = useState<SecuenciaNcfInput | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  async function recargar() {
    setLista(await repo.listar());
  }
  useEffect(() => {
    void recargar();
  }, []);

  async function guardar() {
    if (!form) return;
    try {
      await repo.crear(form);
      setForm(null);
      setErrores([]);
      await recargar();
    } catch (e) {
      setErrores(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje) : [String(e)]);
    }
  }

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0 }}>🧾 Secuencias NCF (e-CF)</h3>
        <button style={s.botonSecundario} onClick={() => { setForm({ ...VACIO }); setErrores([]); }}>
          + Cargar secuencia
        </button>
      </div>

      {form && (
        <div style={{ background: c.fondo, border: `1px solid ${c.borde}`, borderRadius: 10, padding: 14, marginBottom: 14, marginTop: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={s.label}>Tipo</label>
              <select style={s.input} value={form.tipoEcf}
                onChange={(e) => setForm({ ...form, tipoEcf: e.target.value as TipoEcf })}>
                {TIPOS.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_ECF[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Rango desde</label>
              <input style={s.input} type="text" inputMode="numeric" value={form.rangoDesde}
                onChange={(e) => setForm({ ...form, rangoDesde: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={s.label}>Rango hasta</label>
              <input style={s.input} type="text" inputMode="numeric" value={form.rangoHasta}
                onChange={(e) => setForm({ ...form, rangoHasta: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={s.label}>Vencimiento</label>
              <input style={s.input} type="date" value={form.vencimiento}
                onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} />
            </div>
          </div>
          {errores.length > 0 && <div style={s.errorBox}>{errores.join(" ")}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.borde}` }}>
            <button style={s.boton} onClick={guardar}>Guardar secuencia</button>
            <button style={s.botonSecundario} onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <table style={s.tabla}>
        <thead>
          <tr>
            <th style={s.th}>Tipo</th>
            <th style={s.th}>Rango</th>
            <th style={s.th}>Próximo</th>
            <th style={s.th}>Restantes</th>
            <th style={s.th}>Vencimiento</th>
            <th style={s.th}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr><td style={s.filaVacia} colSpan={6}>Sin secuencias cargadas. Sin esto no se puede emitir NCF.</td></tr>
          )}
          {lista.map((sec) => (
            <tr key={sec.id}>
              <td style={s.td}><span style={s.badge}>{ETIQUETA_TIPO_ECF[sec.tipo_ecf]}</span></td>
              <td style={s.td}>{sec.rango_desde}–{sec.rango_hasta}</td>
              <td style={s.tdDerecha}>{sec.proximo_numero}</td>
              <td style={s.tdDerecha}>
                {restantes(sec)}
                {sec.estado === "disponible" && restantes(sec) <= UMBRAL_BAJO && (
                  <span style={{ color: c.rojo, marginLeft: 6, fontSize: 12 }}>⚠ umbral bajo</span>
                )}
              </td>
              <td style={s.td}>{sec.vencimiento}</td>
              <td style={s.td}>
                <span style={{ ...s.badge, color: COLOR_ESTADO[sec.estado], background: c.grisClaro }}>{sec.estado}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
