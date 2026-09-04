import { useEffect, useState, useCallback } from "react";
import { type CorteCaja as CorteCajaTipo, type ResumenPeriodoVentas, calcularCorteCaja } from "@sfr/core";
import { ChartColumn, Banknote, ClipboardList } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c, money } from "../estilos.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { filtrarNumero } from "../utilidades/numero.js";
import { mensajeError } from "../utilidades/errores.js";

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

  useAtajosTeclado({ "Ctrl+S": () => { if (resumen && !guardando) void registrarCorte(); } });

  const cargarResumen = useCallback(async () => {
    setError(null);
    try {
      setResumen(await repo.calcularResumen(desde, hasta));
    } catch (e) {
      setError(mensajeError(e));
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
      setError(mensajeError(e));
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
            <input style={s.input} type="text" inputMode="decimal" value={montoInicial} onChange={(e) => setMontoInicial(filtrarNumero(e.target.value))} />
          </div>
          <div>
            <label style={s.label}>Efectivo contado</label>
            <input style={s.input} type="text" inputMode="decimal" value={efectivoContado} onChange={(e) => setEfectivoContado(filtrarNumero(e.target.value))} />
          </div>
        </div>
        {error && <div role="alert" style={s.errorBox}>{error}</div>}
        {mensaje && (
          <div style={{ ...s.errorBox, background: c.verdeFondo, borderColor: c.verde, color: c.verde }}>{mensaje}</div>
        )}
      </div>

      {resumen && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}><ChartColumn size={16} /> Ventas del período</h4>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Facturas cobradas</span><span>{resumen.cantidadFacturas}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>ITBIS</span><span>RD$ {money(resumen.totalItbis)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 700, borderTop: `1px solid ${c.borde}`, paddingTop: 8, marginBottom: 12 }}>
              <span>Total ventas</span><span>RD$ {money(resumen.totalVentas)}</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Efectivo</span><span>RD$ {money(resumen.totalEfectivo)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Tarjeta</span><span>RD$ {money(resumen.totalTarjeta)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Transferencia</span><span>RD$ {money(resumen.totalTransferencia)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: c.gris }}>Crédito</span><span>RD$ {money(resumen.totalCredito)}</span>
            </div>
          </div>

          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}><Banknote size={16} /> Efectivo</h4>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>Fondo inicial</span><span>RD$ {money(Number(montoInicial) || 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
              <span style={{ color: c.gris }}>+ Ventas en efectivo</span><span>RD$ {money(resumen.totalEfectivo)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, borderTop: `1px solid ${c.borde}`, paddingTop: 8, marginBottom: 8 }}>
              <span>Efectivo esperado</span><span>RD$ {money(efectivoEsperado)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 12 }}>
              <span style={{ color: c.gris }}>Efectivo contado</span><span>RD$ {money(Number(efectivoContado) || 0)}</span>
            </div>
            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                fontSize: 18, fontWeight: 700, borderRadius: 8, padding: "10px 14px",
                background: diferencia === 0 ? c.verdeFondo : c.rojoFondo,
                color: diferencia === 0 ? c.verde : c.rojo,
              }}
            >
              <span>Diferencia</span>
              <span>RD$ {money(diferencia)}</span>
            </div>

            <button style={{ ...s.boton, width: "100%", marginTop: 16 }} disabled={guardando} onClick={registrarCorte}>
              Registrar corte (Ctrl+S)
            </button>
          </div>
        </div>
      )}

      <div style={{ ...s.tarjeta, marginTop: 16 }}>
        <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}><ClipboardList size={16} /> Cortes anteriores</h4>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th scope="col" style={s.th}>Período</th>
              <th scope="col" style={s.th}>Total ventas</th>
              <th scope="col" style={s.th}>Efectivo esperado</th>
              <th scope="col" style={s.th}>Efectivo contado</th>
              <th scope="col" style={s.th}>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 && (
              <tr><td style={s.filaVacia} colSpan={5}>Todavía no se ha registrado ningún corte.</td></tr>
            )}
            {historial.map((h) => (
              <tr key={h.id}>
                <td style={s.td}>{h.fecha_apertura === h.fecha_cierre ? h.fecha_apertura : `${h.fecha_apertura} – ${h.fecha_cierre}`}</td>
                <td style={s.tdDerecha}>RD$ {money(h.total_ventas)}</td>
                <td style={s.tdDerecha}>RD$ {money(h.efectivo_esperado)}</td>
                <td style={s.tdDerecha}>RD$ {money(h.efectivo_contado)}</td>
                <td style={{ ...s.tdDerecha, color: h.diferencia === 0 ? c.verde : c.rojo, fontWeight: 600 }}>RD$ {money(h.diferencia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
