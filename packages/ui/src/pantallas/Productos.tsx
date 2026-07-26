import { Fragment, useEffect, useState } from "react";
import {
  type Producto,
  type ProductoInput,
  type ImpuestoTipo,
  type MovimientoInventario,
  ValidacionError,
} from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";
import { ImportarProductos } from "../componentes/ImportarProductos.js";

const IMPUESTOS: { valor: ImpuestoTipo; etiqueta: string }[] = [
  { valor: "itbis18", etiqueta: "ITBIS 18%" },
  { valor: "itbis16", etiqueta: "ITBIS 16%" },
  { valor: "exento", etiqueta: "Exento" },
];

const ETIQUETA_MOVIMIENTO: Record<MovimientoInventario["tipo"], string> = {
  entrada: "Entrada", salida: "Salida", ajuste: "Ajuste", venta: "Venta", compra: "Compra",
};

const POR_PAGINA = 50;

const ETIQUETA_IMPUESTO: Record<ImpuestoTipo, string> = Object.fromEntries(
  IMPUESTOS.map((i) => [i.valor, i.etiqueta]),
) as Record<ImpuestoTipo, string>;

const VACIO: ProductoInput = {
  descripcion: "",
  codigo_barra: "",
  costo: 0,
  pct_ganancia: 0,
  precio_venta: null,
  precio_mayoreo: null,
  impuesto_tipo: "itbis18",
  politica_sin_existencia: "advertir",
};

export function Productos() {
  const { producto: repo, negocio: negocioRepo, movimientoInventario } = useRepos();
  const [lista, setLista] = useState<Producto[]>([]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<ProductoInput | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [inventarioActivo, setInventarioActivo] = useState(false);

  const [ajustando, setAjustando] = useState<string | null>(null);
  const [nuevaExistencia, setNuevaExistencia] = useState("");
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null);

  const [viendoMovimientos, setViendoMovimientos] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);

  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [pagina, setPagina] = useState(1);

  async function recargar(filtro = q) {
    setLista(await repo.listar(filtro));
    setPagina(1);
  }
  useEffect(() => {
    void recargar("");
    void negocioRepo.obtener().then((n) => setInventarioActivo(n?.inventario_activo === 1));
  }, []);

  function iniciarAjuste(p: Producto) {
    setAjustando(p.id);
    setNuevaExistencia(String(p.existencia ?? 0));
    setErrorAjuste(null);
  }

  async function confirmarAjuste(p: Producto) {
    setErrorAjuste(null);
    try {
      await repo.ajustarExistencia(p.id, Number(nuevaExistencia) || 0);
      setAjustando(null);
      await recargar();
    } catch (e) {
      setErrorAjuste(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }

  async function alternarMovimientos(p: Producto) {
    if (viendoMovimientos === p.id) {
      setViendoMovimientos(null);
      return;
    }
    setViendoMovimientos(p.id);
    setMovimientos(await movimientoInventario.listarPorProducto(p.id));
  }

  function nuevo() {
    setEditando(null);
    setForm({ ...VACIO });
    setErrores([]);
  }
  function editar(p: Producto) {
    setEditando(p);
    setForm({
      descripcion: p.descripcion,
      codigo_barra: p.codigo_barra ?? "",
      costo: p.costo,
      pct_ganancia: p.pct_ganancia,
      precio_venta: p.precio_venta,
      precio_mayoreo: p.precio_mayoreo,
      impuesto_tipo: p.impuesto_tipo,
      politica_sin_existencia: p.politica_sin_existencia,
    });
    setErrores([]);
  }

  async function guardar() {
    if (!form) return;
    try {
      if (editando) await repo.actualizar(editando.id, form);
      else await repo.crear(form);
      setForm(null);
      setEditando(null);
      await recargar();
    } catch (e) {
      if (e instanceof ValidacionError) setErrores(e.errores.map((x) => x.mensaje));
      else setErrores([String(e)]);
    }
  }

  async function eliminar(p: Producto) {
    if (!confirm(`¿Eliminar "${p.descripcion}"?`)) return;
    await repo.eliminar(p.id);
    await recargar();
  }

  /** Exporta el catálogo actual a CSV — mismas columnas que "Importar productos" espera, para poder ir y volver. */
  function exportarCsv() {
    const encabezados = ["Descripción", "Codigo", "Costo", "Precio Venta", "Precio Mayoreo", "Impuesto", "Existencia"];
    const filas = lista.map((p) => [
      p.descripcion,
      p.codigo_barra ?? "",
      p.costo.toFixed(2),
      p.precio_venta.toFixed(2),
      p.precio_mayoreo != null ? p.precio_mayoreo.toFixed(2) : "",
      p.impuesto_tipo,
      p.existencia != null ? String(p.existencia) : "",
    ]);
    const csv = [encabezados, ...filas]
      .map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "productos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPaginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const visibles = lista.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <button style={s.boton} onClick={nuevo}>+ Nuevo producto</button>
        <button style={s.botonSecundario} onClick={() => setMostrarImportar(true)}>Importar productos</button>
        <button style={s.botonSecundario} onClick={exportarCsv} disabled={lista.length === 0}>Exportar CSV</button>
        <input
          style={{ ...s.input, maxWidth: 320 }}
          placeholder="Buscar por descripción o código…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            void recargar(e.target.value);
          }}
        />
        <span style={{ color: c.gris, fontSize: 13 }}>{lista.length} producto(s)</span>
      </div>

      {form && (
        <div style={{ ...s.tarjeta, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>📦 {editando ? "Editar producto" : "Nuevo producto"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={s.label}>Descripción *</label>
              <input
                style={s.input}
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              />
            </div>
            <div>
              <label style={s.label}>Código de barra (opcional)</label>
              <input
                style={s.input}
                value={form.codigo_barra ?? ""}
                onChange={(e) => setForm({ ...form, codigo_barra: e.target.value })}
              />
            </div>
            <div>
              <label style={s.label}>Costo</label>
              <input
                style={s.input}
                type="number"
                value={form.costo ?? 0}
                onChange={(e) => setForm({ ...form, costo: Number(e.target.value) })}
              />
            </div>
            <div>
              <label style={s.label}>% Ganancia</label>
              <input
                style={s.input}
                type="number"
                value={form.pct_ganancia ?? 0}
                onChange={(e) => setForm({ ...form, pct_ganancia: Number(e.target.value) })}
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
                  setForm({
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
                  setForm({
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
                onChange={(e) => setForm({ ...form, impuesto_tipo: e.target.value as ImpuestoTipo })}
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
                  onChange={(e) => setForm({ ...form, politica_sin_existencia: e.target.value as "bloquear" | "advertir" })}
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
            <button style={s.boton} onClick={guardar}>Guardar</button>
            <button style={s.botonSecundario} onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={s.tarjeta}>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Descripción</th>
              <th style={s.th}>Código</th>
              <th style={s.th}>Costo</th>
              <th style={s.th}>Precio</th>
              <th style={s.th}>Impuesto</th>
              {inventarioActivo && <th style={s.th}>Existencia</th>}
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td style={s.filaVacia} colSpan={inventarioActivo ? 7 : 6}>Sin productos. Crea el primero con “+ Nuevo producto”.</td></tr>
            )}
            {visibles.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td style={s.td}>{p.descripcion}</td>
                  <td style={s.td}>{p.codigo_barra ?? "—"}</td>
                  <td style={s.tdDerecha}>RD$ {p.costo.toFixed(2)}</td>
                  <td style={s.tdDerecha}>RD$ {p.precio_venta.toFixed(2)}</td>
                  <td style={s.td}><span style={s.badge}>{ETIQUETA_IMPUESTO[p.impuesto_tipo]}</span></td>
                  {inventarioActivo && (
                    <td style={s.td}>
                      {ajustando === p.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            style={{ ...s.input, width: 80 }}
                            type="number"
                            value={nuevaExistencia}
                            onChange={(e) => setNuevaExistencia(e.target.value)}
                          />
                          <button style={s.botonSecundario} onClick={() => confirmarAjuste(p)}>OK</button>
                          <button style={s.botonSecundario} onClick={() => setAjustando(null)}>×</button>
                        </div>
                      ) : (
                        <>
                          {p.existencia ?? 0}
                          {p.existencia != null && p.existencia <= 0 && (
                            <span style={{ color: c.rojo, marginLeft: 6, fontSize: 12 }}>⚠ agotado</span>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                    <button style={s.botonSecundario} onClick={() => editar(p)}>Editar</button>{" "}
                    {inventarioActivo && (
                      <>
                        <button style={s.botonSecundario} onClick={() => iniciarAjuste(p)}>Ajustar</button>{" "}
                        <button style={s.botonSecundario} onClick={() => alternarMovimientos(p)}>Movimientos</button>{" "}
                      </>
                    )}
                    <button style={s.botonPeligro} onClick={() => eliminar(p)}>Eliminar</button>
                  </td>
                </tr>
                {errorAjuste && ajustando === p.id && (
                  <tr>
                    <td style={s.td} colSpan={inventarioActivo ? 7 : 6}>
                      <div style={s.errorBox}>{errorAjuste}</div>
                    </td>
                  </tr>
                )}
                {viendoMovimientos === p.id && (
                  <tr>
                    <td style={s.td} colSpan={inventarioActivo ? 7 : 6}>
                      {movimientos.length === 0 ? (
                        <span style={{ color: c.gris, fontSize: 13 }}>Sin movimientos registrados.</span>
                      ) : (
                        <table style={s.tabla}>
                          <tbody>
                            {movimientos.map((m) => (
                              <tr key={m.id}>
                                <td style={s.td}>{new Date(m.fecha).toLocaleString("es-DO")}</td>
                                <td style={s.td}>{ETIQUETA_MOVIMIENTO[m.tipo]}</td>
                                <td style={{ ...s.td, textAlign: "right" }}>{m.cantidad > 0 ? "+" : ""}{m.cantidad}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {lista.length > POR_PAGINA && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 14, marginTop: 4, borderTop: `1px solid ${c.borde}` }}>
            <span style={{ color: c.gris, fontSize: 13 }}>
              Página {paginaSegura} de {totalPaginas} — mostrando {visibles.length} de {lista.length}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={s.botonSecundario} disabled={paginaSegura <= 1} onClick={() => setPagina(paginaSegura - 1)}>← Anterior</button>
              <button style={s.botonSecundario} disabled={paginaSegura >= totalPaginas} onClick={() => setPagina(paginaSegura + 1)}>Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {mostrarImportar && (
        <ImportarProductos
          onCerrar={() => setMostrarImportar(false)}
          onImportado={() => void recargar()}
        />
      )}
    </div>
  );
}
