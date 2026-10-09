import { useEffect, useState, type CSSProperties } from "react";
import { type SecuenciaNcf, type SecuenciaNcfInput, type TipoEcf, ETIQUETA_TIPO_ECF, UMBRAL_BAJO } from "@sfr/core";
import { Receipt, TriangleAlert } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";
import { mensajesError } from "../utilidades/errores.js";

const TIPOS: TipoEcf[] = ["32", "31", "34", "33", "41", "43", "44", "45", "46", "47"];

const PADDING_COMPACTO = "8px 5px";
const cabecera: CSSProperties = { ...s.th, padding: PADDING_COMPACTO, fontSize: 11 };
const celda: CSSProperties = { ...s.td, padding: PADDING_COMPACTO, fontSize: 13 };
const celdaSinSalto: CSSProperties = { ...celda, whiteSpace: "nowrap" };
const celdaDerecha: CSSProperties = { ...s.tdDerecha, padding: PADDING_COMPACTO, fontSize: 13 };

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
  const [cerrandoId, setCerrandoId] = useState<string | null>(null);

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
      setErrores(mensajesError(e));
    }
  }

  async function cerrar(id: string) {
    try {
      await repo.cerrar(id);
      setCerrandoId(null);
      setErrores([]);
      await recargar();
    } catch (e) {
      setErrores(mensajesError(e));
    }
  }

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Receipt size={18} /> Secuencias NCF (e-CF)
        </h3>
        <button
          style={s.botonSecundario}
          onClick={() => {
            setForm({ ...VACIO });
            setErrores([]);
          }}
        >
          + Cargar secuencia
        </button>
      </div>

      {form && (
        <div
          style={{
            background: c.fondo,
            border: `1px solid ${c.borde}`,
            borderRadius: 10,
            padding: 14,
            marginBottom: 14,
            marginTop: 12,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
            <div>
              <label style={s.label}>Tipo</label>
              <select
                style={s.input}
                value={form.tipoEcf}
                onChange={(e) => setForm({ ...form, tipoEcf: e.target.value as TipoEcf })}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_ECF[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={s.label}>Rango desde</label>
              <input
                style={s.input}
                type="text"
                inputMode="numeric"
                value={form.rangoDesde}
                onChange={(e) => setForm({ ...form, rangoDesde: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label style={s.label}>Rango hasta</label>
              <input
                style={s.input}
                type="text"
                inputMode="numeric"
                value={form.rangoHasta}
                onChange={(e) => setForm({ ...form, rangoHasta: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label style={s.label}>Vencimiento</label>
              <input
                style={{ ...s.input, minWidth: 0 }}
                type="date"
                value={form.vencimiento}
                onChange={(e) => setForm({ ...form, vencimiento: e.target.value })}
              />
            </div>
          </div>
          {errores.length > 0 && (
            <div role="alert" style={s.errorBox}>
              {errores.join(" ")}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.borde}` }}>
            <button style={s.boton} onClick={guardar}>
              Guardar secuencia
            </button>
            <button style={s.botonSecundario} onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th scope="col" style={cabecera}>
                Tipo
              </th>
              <th scope="col" style={cabecera}>
                Rango
              </th>
              <th scope="col" style={cabecera}>
                Próximo
              </th>
              <th scope="col" style={cabecera}>
                Restantes
              </th>
              <th scope="col" style={cabecera}>
                Vencimiento
              </th>
              <th scope="col" style={cabecera}>
                Estado
              </th>
              <th scope="col" style={cabecera}></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td style={s.filaVacia} colSpan={7}>
                  Sin secuencias cargadas. Sin esto no se puede emitir NCF.
                </td>
              </tr>
            )}
            {lista.map((sec) => (
              <tr key={sec.id}>
                <td style={celda}>
                  <span style={s.badge}>{ETIQUETA_TIPO_ECF[sec.tipo_ecf]}</span>
                </td>
                <td style={celdaSinSalto}>
                  {sec.rango_desde}–{sec.rango_hasta}
                </td>
                <td style={celdaDerecha}>{sec.proximo_numero}</td>
                <td style={celdaDerecha}>
                  {restantes(sec)}
                  {sec.estado === "disponible" && restantes(sec) <= UMBRAL_BAJO && (
                    <span
                      style={{
                        color: c.rojo,
                        marginLeft: 6,
                        fontSize: 12,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <TriangleAlert size={11} /> umbral bajo
                    </span>
                  )}
                </td>
                <td style={celdaSinSalto}>{sec.vencimiento}</td>
                <td style={celda}>
                  <span style={{ ...s.badge, color: COLOR_ESTADO[sec.estado], background: c.grisClaro }}>
                    {sec.estado}
                  </span>
                </td>
                <td style={celda}>
                  {sec.estado === "disponible" &&
                    (cerrandoId === sec.id ? (
                      <span style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          type="button"
                          className="sfr-peligro"
                          style={s.botonPeligro}
                          onClick={() => void cerrar(sec.id)}
                        >
                          Confirmar cierre
                        </button>
                        <button type="button" style={s.botonSecundario} onClick={() => setCerrandoId(null)}>
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="sfr-peligro"
                        style={s.botonPeligro}
                        title="Deja de ofrecer los números que no se han usado"
                        onClick={() => setCerrandoId(sec.id)}
                      >
                        Cerrar
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
