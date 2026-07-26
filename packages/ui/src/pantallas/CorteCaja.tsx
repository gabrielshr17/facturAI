import { useEffect, useState, useCallback } from "react";
import { type CorteCaja as CorteCajaTipo, type ResumenPeriodoVentas, calcularCorteCaja, ValidacionError } from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";

/** Fecha local (no UTC): `toISOString` corre el día si la zona horaria está adelantada a UTC. */
function hoyIso(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Corte de caja: totales por método de pago del período, efectivo esperado vs contado. */
export function CorteCaja() {
  const { corteCaja: repo } = useRepos();

  const [desde, setDesde] = useState(hoyIso());
  const [hasta, setHasta] = useState(hoyIso());
  const [montoInicial, setMontoInicial] = useState("0");
  const [efectivoContado, setEfectivoContado] = useState("0");

  const [resumen, setResumen] = useState<ResumenPeriodoVentas | null>(null);
  const [historial, setHistorial] = useState<CorteCajaTipo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargarResumen = useCallback(async () => {
    setError(null);
    try {
      setResumen(await repo.calcularResumen(desde, hasta));
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    }
  }, [repo, desde, hasta]);

  const cargarHistorial = useCallback(async () => {
    setHistorial(await repo.listar());
  }, [repo]);

  useEffect(() => { void cargarResumen(); }, [cargarResumen]);
  useEffect(() => { void cargarHistorial(); }, [cargarHistorial]);

  const { efectivoEsperado, diferencia } = calcularCorteCaja({
    montoInicial: Number(montoInicial) || 0,
    totalEfectivo: resumen?.totalEfectivo ?? 0,
    efectivoContado: Number(efectivoContado) || 0,
  });

  async function registrarCorte() {
    setError(null);
    setMensaje(null);
    setGuardando(true);
    try {
      await repo.registrarCorte({
        desde,
        hasta,
        montoInicial: Number(montoInicial) || 0,
        efectivoContado: Number(efectivoContado) || 0,
      });
      setMensaje("Corte registrado.");
      await cargarHistorial();
    } catch (e) {
      setError(e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <div style={{ ...s.tarjeta, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={s.label}>Desde</label>
            <input style={s.input} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Hasta</label>
            <input style={s.input} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Fondo de caja inicial</label>
            <input style={s.input} type="number" value={montoInicial} onChange={(e) => setMontoInicial(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Efectivo contado</label>
            <input style={s.input} type="number" value={efectivoContado} onChange={(e) => setEfectivoContado(e.target.value)} />
          </div>
        </div>
        {error && <div style={s.errorBox}>{error}</div>}
        {mensaje && (
          <div style={{ ...s.errorBox, background: "#f0fdf4", borderColor: c.verde, color: c.verde }}>{mensaje}</div>
        )}
      </div>

      {resumen && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0 }}>📊 Ventas del período</h4>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Facturas cobradas</span><span>{resumen.cantidadFacturas}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>ITBIS</span><span>RD$ {resumen.totalItbis.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, borderTop: `1px solid ${c.borde}`, paddingTop: 8, marginBottom: 12 }}>
              <span>Total ventas</span><span>RD$ {resumen.totalVentas.toFixed(2)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Efectivo</span><span>RD$ {resumen.totalEfectivo.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Tarjeta</span><span>RD$ {resumen.totalTarjeta.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Transferencia</span><span>RD$ {resumen.totalTransferencia.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: c.gris }}>Crédito</span><span>RD$ {resumen.totalCredito.toFixed(2)}</span>
            </div>
          </div>

          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0 }}>💵 Efectivo</h4>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Fondo inicial</span><span>RD$ {(Number(montoInicial) || 0).toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>+ Ventas en efectivo</span><span>RD$ {resumen.totalEfectivo.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, borderTop: `1px solid ${c.borde}`, paddingTop: 8, marginBottom: 8 }}>
              <span>Efectivo esperado</span><span>RD$ {efectivoEsperado.toFixed(2)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 12 }}>
              <span style={{ color: c.gris }}>Efectivo contado</span><span>RD$ {(Number(efectivoContado) || 0).toFixed(2)}</span>
            </div>
            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 18, fontWeight: 700, borderRadius: 8, padding: "10px 14px",
                background: diferencia === 0 ? "#f0fdf4" : "#fef2f2",
                color: diferencia === 0 ? c.verde : c.rojo,
              }}
            >
              <span>Diferencia</span>
              <span>RD$ {diferencia.toFixed(2)}</span>
            </div>

            <button style={{ ...s.boton, width: "100%", marginTop: 16 }} disabled={guardando} onClick={registrarCorte}>
              Registrar corte
            </button>
          </div>
        </div>
      )}

      <div style={{ ...s.tarjeta, marginTop: 16 }}>
        <h4 style={{ marginTop: 0 }}>📋 Cortes anteriores</h4>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Período</th>
              <th style={s.th}>Total ventas</th>
              <th style={s.th}>Efectivo esperado</th>
              <th style={s.th}>Efectivo contado</th>
              <th style={s.th}>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 && (
              <tr><td style={s.filaVacia} colSpan={5}>Todavía no se ha registrado ningún corte.</td></tr>
            )}
            {historial.map((h) => (
              <tr key={h.id}>
                <td style={s.td}>{h.fecha_apertura === h.fecha_cierre ? h.fecha_apertura : `${h.fecha_apertura} – ${h.fecha_cierre}`}</td>
                <td style={s.tdDerecha}>RD$ {h.total_ventas.toFixed(2)}</td>
                <td style={s.tdDerecha}>RD$ {h.efectivo_esperado.toFixed(2)}</td>
                <td style={s.tdDerecha}>RD$ {h.efectivo_contado.toFixed(2)}</td>
                <td style={{ ...s.tdDerecha, color: h.diferencia === 0 ? c.verde : c.rojo, fontWeight: 600 }}>RD$ {h.diferencia.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
