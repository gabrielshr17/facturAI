import { useEffect, useState, useCallback } from "react";
import {
  type VentaPorDia,
  type ProductoVendido,
  type ResumenGanancia,
  type ResumenItbis,
  type ResumenPorMetodo,
} from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";

function hoyIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function primerDiaDelMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo", transferencia: "Transferencia", credito: "Crédito", tarjeta: "Tarjeta",
};

/** Reportes avanzados (§ Fase 3): ventas por día, productos más vendidos, ganancia estimada, ITBIS. */
export function Reportes() {
  const { reportes: repo } = useRepos();
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(hoyIso());

  const [ventasPorDia, setVentasPorDia] = useState<VentaPorDia[]>([]);
  const [productos, setProductos] = useState<ProductoVendido[]>([]);
  const [ganancia, setGanancia] = useState<ResumenGanancia | null>(null);
  const [itbis, setItbis] = useState<ResumenItbis | null>(null);
  const [porMetodo, setPorMetodo] = useState<ResumenPorMetodo[]>([]);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [vpd, pmv, gan, itb, pm] = await Promise.all([
        repo.ventasPorDia(desde, hasta),
        repo.productosMasVendidos(desde, hasta, 10),
        repo.resumenGanancia(desde, hasta),
        repo.resumenItbis(desde, hasta),
        repo.ventasPorMetodoPago(desde, hasta),
      ]);
      setVentasPorDia(vpd);
      setProductos(pmv);
      setGanancia(gan);
      setItbis(itb);
      setPorMetodo(pm);
    } finally {
      setCargando(false);
    }
  }, [repo, desde, hasta]);

  useEffect(() => { void cargar(); }, [cargar]);

  const totalVentas = ventasPorDia.reduce((acc, v) => acc + v.totalVentas, 0);
  const maxVenta = Math.max(1, ...ventasPorDia.map((v) => v.totalVentas));

  function exportarCsv() {
    const filas = [
      ["Fecha", "Total ventas", "Cantidad facturas"],
      ...ventasPorDia.map((v) => [v.fecha, v.totalVentas.toFixed(2), String(v.cantidadFacturas)]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div style={{ ...s.tarjeta, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={s.label}>Desde</label>
            <input style={s.input} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Hasta</label>
            <input style={s.input} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <button style={s.botonSecundario} onClick={exportarCsv} disabled={ventasPorDia.length === 0}>
            Exportar CSV
          </button>
          {cargando && <span style={{ color: c.gris, fontSize: 13 }}>Cargando…</span>}
        </div>
        <p style={{ color: c.gris, fontSize: 12, marginBottom: 0, marginTop: 8 }}>
          Ventas brutas del período (no descuenta devoluciones). La ganancia usa el costo ACTUAL del producto como estimación.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={s.tarjeta}>
          <h4 style={{ marginTop: 0, color: c.gris, fontSize: 13, fontWeight: 600 }}>💰 Total ventas</h4>
          <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>RD$ {totalVentas.toFixed(2)}</div>
        </div>
        <div style={s.tarjeta}>
          <h4 style={{ marginTop: 0, color: c.gris, fontSize: 13, fontWeight: 600 }}>📈 Ganancia estimada</h4>
          <div style={{ fontSize: 26, fontWeight: 700, color: c.verde, fontVariantNumeric: "tabular-nums" }}>RD$ {(ganancia?.gananciaEstimada ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: 12, color: c.gris }}>Costo estimado: RD$ {(ganancia?.costoEstimado ?? 0).toFixed(2)}</div>
        </div>
        <div style={s.tarjeta}>
          <h4 style={{ marginTop: 0, color: c.gris, fontSize: 13, fontWeight: 600 }}>🧾 ITBIS recaudado</h4>
          <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>RD$ {(itbis?.totalItbis ?? 0).toFixed(2)}</div>
          <div style={{ fontSize: 12, color: c.gris }}>
            Gravado RD$ {(itbis?.totalGravado ?? 0).toFixed(2)} · Exento RD$ {(itbis?.totalExento ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={s.tarjeta}>
          <h4 style={{ marginTop: 0 }}>📅 Ventas por día</h4>
          {ventasPorDia.length === 0 && <p style={{ color: c.gris }}>Sin ventas en este período.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ventasPorDia.map((v) => (
              <div key={v.fecha}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                  <span>{v.fecha}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {v.totalVentas.toFixed(2)} ({v.cantidadFacturas})</span>
                </div>
                <div style={{ background: c.grisClaro, borderRadius: 999, height: 7, overflow: "hidden" }}>
                  <div style={{ background: c.azul, borderRadius: 999, height: 7, width: `${(v.totalVentas / maxVenta) * 100}%`, transition: "width 200ms ease" }} />
                </div>
              </div>
            ))}
          </div>

          <h4 style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${c.borde}` }}>💳 Ventas por método de pago</h4>
          {porMetodo.map((m) => (
            <div key={m.metodo} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
              <span>{ETIQUETA_METODO[m.metodo] ?? m.metodo}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {m.total.toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div style={s.tarjeta}>
          <h4 style={{ marginTop: 0 }}>🏆 Productos más vendidos</h4>
          <table style={s.tabla}>
            <thead>
              <tr>
                <th style={s.th}>Producto</th>
                <th style={s.th}>Cant.</th>
                <th style={s.th}>Total</th>
              </tr>
            </thead>
            <tbody>
              {productos.length === 0 && (
                <tr><td style={s.filaVacia} colSpan={3}>Sin datos.</td></tr>
              )}
              {productos.map((p, i) => (
                <tr key={p.productoId ?? i}>
                  <td style={s.td}>{p.descripcion}</td>
                  <td style={s.tdDerecha}>{p.cantidadVendida}</td>
                  <td style={s.tdDerecha}>RD$ {p.totalVendido.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
