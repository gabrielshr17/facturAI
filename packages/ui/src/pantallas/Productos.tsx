import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  type Producto,
  type ProductoInput,
  type ImpuestoTipo,
  type MovimientoInventario,
  ValidacionError,
  pctGananciaDesdePrecio,
} from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c, money } from "../estilos.js";
import { ImportarProductos } from "../componentes/ImportarProductos.js";
import { FormularioProducto, diferenciasProducto, type CambioProducto } from "../componentes/FormularioProducto.js";
import { ModalConfirmarCambios } from "../componentes/ModalConfirmarCambios.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { filtrarNumero } from "../utilidades/numero.js";

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
  tipo_venta: "unidad",
  unidad_medida: "",
  costo: 0,
  pct_ganancia: 0,
  precio_venta: null,
  precio_mayoreo: null,
  impuesto_tipo: "itbis18",
  politica_sin_existencia: "advertir",
};

export function Productos() {
  const { producto: repo, negocio: negocioRepo, movimientoInventario, factura: facturaRepo } = useRepos();
  const [lista, setLista] = useState<Producto[]>([]);
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Producto | null>(null);
  const [form, setForm] = useState<ProductoInput | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [cambiosPendientes, setCambiosPendientes] = useState<CambioProducto[] | null>(null);
  const [inventarioActivo, setInventarioActivo] = useState(false);

  const [ajustando, setAjustando] = useState<string | null>(null);
  const [nuevaExistencia, setNuevaExistencia] = useState("");
  const [errorAjuste, setErrorAjuste] = useState<string | null>(null);

  const [viendoMovimientos, setViendoMovimientos] = useState<string | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);

  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [pagina, setPagina] = useState(1);

  const busquedaRef = useRef<HTMLInputElement>(null);
  const enfocarBusqueda = useCallback(() => busquedaRef.current?.focus(), []);
  useAtajosTeclado({
    F10: enfocarBusqueda,
    F6: () => nuevo(),
    "Ctrl+S": () => { if (form) void guardar(); },
    Escape: () => { if (form) setForm(null); },
  }, cambiosPendientes === null);
  useAtajosTeclado({
    "Ctrl+S": () => void guardarAhora(),
    Escape: () => setCambiosPendientes(null),
  }, cambiosPendientes !== null);

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
      tipo_venta: p.tipo_venta,
      unidad_medida: p.unidad_medida ?? "",
      costo: p.costo,
      // El % guardado solo se actualiza cuando el precio se DERIVA de costo + %; si
      // se escribió el precio a mano queda desfasado (típicamente en 0) — se muestra
      // el % que ese precio implica de verdad, no el valor guardado y obsoleto.
      pct_ganancia: pctGananciaDesdePrecio(p.costo, p.precio_venta, p.tasa_impuesto),
      precio_venta: p.precio_venta,
      precio_mayoreo: p.precio_mayoreo,
      impuesto_tipo: p.impuesto_tipo,
      politica_sin_existencia: p.politica_sin_existencia,
    });
    setErrores([]);
  }

  /** Al editar (no al crear), primero muestra qué va a cambiar y pide confirmar — así una
   *  corrección de precio no se aplica sin querer. Si nada cambió, no hay nada que confirmar. */
  function guardar() {
    if (!form) return;
    if (editando) {
      const cambios = diferenciasProducto(editando, form);
      if (cambios.length === 0) { setForm(null); setEditando(null); return; }
      setCambiosPendientes(cambios);
      return;
    }
    void guardarAhora();
  }

  async function guardarAhora() {
    if (!form) return;
    try {
      if (editando) {
        await repo.actualizar(editando.id, form);
        // Un ticket abierto pudo agregar este producto ANTES de la corrección — sin esto se
        // quedaría cobrando el precio viejo aunque el catálogo ya muestre el nuevo.
        const actualizado = await repo.obtener(editando.id);
        if (actualizado) {
          await facturaRepo.actualizarPrecioEnTicketsAbiertos({
            productoId: actualizado.id,
            precioVenta: actualizado.precio_venta,
            precioMayoreo: actualizado.precio_mayoreo,
            impuestoTipo: actualizado.impuesto_tipo,
            tasaImpuesto: actualizado.tasa_impuesto,
          });
        }
      } else {
        await repo.crear(form);
      }
      setForm(null);
      setEditando(null);
      setCambiosPendientes(null);
      await recargar();
    } catch (e) {
      setCambiosPendientes(null);
      if (e instanceof ValidacionError) setErrores(e.errores.map((x) => x.mensaje));
      else setErrores([String(e)]);
    }
  }

  async function eliminar(p: Producto) {
    if (!confirm(`¿Eliminar "${p.descripcion}"?`)) return;
    await repo.eliminar(p.id);
    await recargar();
  }

  /** Favorito: sube el producto al tope de la búsqueda en Ventas (§ F10 / F11). */
  async function alternarFavorito(p: Producto) {
    await repo.alternarFavorito(p.id, p.favorito !== 1);
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
        <button style={s.boton} onClick={nuevo}>+ Nuevo producto (F6)</button>
        <button style={s.botonSecundario} onClick={() => setMostrarImportar(true)}>Importar productos</button>
        <button style={s.botonSecundario} onClick={exportarCsv} disabled={lista.length === 0}>Exportar CSV</button>
        <input
          ref={busquedaRef}
          style={{ ...s.input, maxWidth: 320 }}
          placeholder="Buscar por descripción o código… (F10)"
          value={q}
          autoFocus
          onChange={(e) => {
            setQ(e.target.value);
            void recargar(e.target.value);
          }}
        />
        <span style={{ color: c.gris, fontSize: 13 }}>{lista.length} producto(s)</span>
      </div>

      {form && (
        <FormularioProducto
          form={form}
          onCambiar={setForm}
          editando={!!editando}
          inventarioActivo={inventarioActivo}
          errores={errores}
          onGuardar={guardar}
          onCancelar={() => setForm(null)}
        />
      )}

      <div style={s.tarjeta}>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}></th>
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
              <tr><td style={s.filaVacia} colSpan={inventarioActivo ? 8 : 7}>Sin productos. Crea el primero con “+ Nuevo producto”.</td></tr>
            )}
            {visibles.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td style={s.td}>
                    <button
                      onClick={() => void alternarFavorito(p)}
                      title={p.favorito === 1 ? "Quitar de favoritos" : "Marcar como favorito"}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 17, padding: 0, lineHeight: 1, color: p.favorito === 1 ? c.amarillo : c.gris, opacity: p.favorito === 1 ? 1 : 0.4 }}
                    >
                      {p.favorito === 1 ? "★" : "☆"}
                    </button>
                  </td>
                  <td style={s.td}>{p.descripcion}</td>
                  <td style={s.td}>{p.codigo_barra ?? "—"}</td>
                  <td style={s.tdDerecha}>RD$ {money(p.costo)}</td>
                  <td style={s.tdDerecha}>RD$ {money(p.precio_venta)}</td>
                  <td style={s.td}><span style={s.badge}>{ETIQUETA_IMPUESTO[p.impuesto_tipo]}</span></td>
                  {inventarioActivo && (
                    <td style={s.td}>
                      {ajustando === p.id ? (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input
                            style={{ ...s.input, width: 80 }}
                            type="text"
                            inputMode="decimal"
                            value={nuevaExistencia}
                            onChange={(e) => setNuevaExistencia(filtrarNumero(e.target.value))}
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
                    <td style={s.td} colSpan={inventarioActivo ? 8 : 7}>
                      <div style={s.errorBox}>{errorAjuste}</div>
                    </td>
                  </tr>
                )}
                {viendoMovimientos === p.id && (
                  <tr>
                    <td style={s.td} colSpan={inventarioActivo ? 8 : 7}>
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

      {cambiosPendientes && (
        <ModalConfirmarCambios
          cambios={cambiosPendientes}
          onConfirmar={() => void guardarAhora()}
          onCancelar={() => setCambiosPendientes(null)}
        />
      )}
    </div>
  );
}
