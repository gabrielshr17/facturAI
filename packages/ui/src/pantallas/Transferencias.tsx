import { useCallback, useEffect, useState } from "react";
import { Landmark, LogIn, RefreshCw, Check, X } from "lucide-react";
import { useAuth } from "../contexto/Auth.js";
import { s, c, money } from "../estilos.js";
import { mensajeError } from "../utilidades/errores.js";
import {
  obtenerTransferenciasRecientes,
  confirmarTransferencia,
  descartarTransferencia,
  type NotificacionTransferencia,
} from "../data/transferenciasCliente.js";

const ETIQUETA_ESTADO: Record<NotificacionTransferencia["estadoConfirmacion"], string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  descartada: "Descartada",
};

const COLOR_ESTADO: Record<NotificacionTransferencia["estadoConfirmacion"], { fondo: string; texto: string }> = {
  pendiente: { fondo: c.amarilloFondo, texto: c.amarillo },
  confirmada: { fondo: c.verdeFondo, texto: c.verde },
  descartada: { fondo: c.grisClaro, texto: c.gris },
};

/**
 * Últimas transferencias recibidas, detectadas a partir del correo de notificación del banco
 * (§ plan.md). Depende del backend opcional (`@sfr/api`) y de una sesión iniciada — sin ninguna
 * de las dos cosas, degrada a un mensaje explícito en vez de romper el resto de la app.
 */
export function Transferencias() {
  const { disponible, sesion, cargando: cargandoSesion, iniciarSesionGoogle } = useAuth();
  const [transferencias, setTransferencias] = useState<NotificacionTransferencia[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!sesion) return;
    setCargando(true);
    setError(null);
    try {
      setTransferencias(await obtenerTransferenciasRecientes(sesion.accessToken));
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setCargando(false);
    }
  }, [sesion]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(id: string, tipo: "confirmar" | "descartar") {
    if (!sesion) return;
    setEnCurso(id);
    setError(null);
    try {
      const actualizada = tipo === "confirmar" ? await confirmarTransferencia(sesion.accessToken, id) : await descartarTransferencia(sesion.accessToken, id);
      setTransferencias((prev) => prev.map((t) => (t.id === id ? actualizada : t)));
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnCurso(null);
    }
  }

  if (!disponible) {
    return (
      <div style={s.tarjeta}>
        <p style={{ margin: 0, color: c.gris }}>
          Esta pantalla requiere el modo multi-caja/multiusuario (Sign in with Google), que no está configurado en
          esta instalación.
        </p>
      </div>
    );
  }

  if (cargandoSesion) {
    return (
      <div style={s.tarjeta}>
        <p style={{ margin: 0, color: c.gris }}>Verificando sesión…</p>
      </div>
    );
  }

  if (!sesion) {
    return (
      <div style={s.tarjeta}>
        <p style={{ marginTop: 0, color: c.gris }}>
          Inicia sesión para ver las transferencias recibidas en las cuentas del negocio.
        </p>
        <button style={{ ...s.boton, display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => void iniciarSesionGoogle()}>
          <LogIn size={14} aria-hidden="true" /> Iniciar sesión con Google
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button
          style={{ ...s.botonSecundario, display: "inline-flex", alignItems: "center", gap: 6 }}
          disabled={cargando}
          onClick={() => void cargar()}
        >
          <RefreshCw size={14} aria-hidden="true" /> {cargando ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ ...s.errorBox, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ ...s.tarjeta, padding: 0, overflow: "hidden" }}>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Fecha</th>
              <th style={s.th}>Banco</th>
              <th style={s.th}>Remitente</th>
              <th style={s.th}>Referencia</th>
              <th style={{ ...s.th, textAlign: "right" }}>Monto</th>
              <th style={s.th}>Estado</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {transferencias.length === 0 && !cargando && (
              <tr>
                <td colSpan={7} style={s.filaVacia}>
                  <Landmark size={22} aria-hidden="true" style={{ marginBottom: 6, opacity: 0.5 }} />
                  <div>No hay transferencias registradas todavía.</div>
                </td>
              </tr>
            )}
            {transferencias.map((t) => {
              const colorEstado = COLOR_ESTADO[t.estadoConfirmacion];
              return (
                <tr key={t.id}>
                  <td style={s.td}>{t.fecha ?? "—"}</td>
                  <td style={s.td}>{t.bancoOrigen ?? "—"}</td>
                  <td style={s.td}>{t.remitente ?? "—"}</td>
                  <td style={s.td}>{t.referencia ?? "—"}</td>
                  <td style={s.tdDerecha}>{t.monto !== null ? `RD$ ${money(t.monto)}` : "—"}</td>
                  <td style={s.td}>
                    <span style={{ ...s.badge, background: colorEstado.fondo, color: colorEstado.texto }}>
                      {ETIQUETA_ESTADO[t.estadoConfirmacion]}
                    </span>
                  </td>
                  <td style={s.td}>
                    {t.estadoConfirmacion === "pendiente" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          style={{ ...s.botonSecundario, padding: "6px 10px", display: "inline-flex", alignItems: "center", gap: 4 }}
                          disabled={enCurso === t.id}
                          onClick={() => void accion(t.id, "confirmar")}
                          aria-label="Confirmar transferencia"
                          title="Confirmar"
                        >
                          <Check size={14} aria-hidden="true" /> Confirmar
                        </button>
                        <button
                          style={{ ...s.botonPeligro, display: "inline-flex", alignItems: "center", gap: 4 }}
                          disabled={enCurso === t.id}
                          onClick={() => void accion(t.id, "descartar")}
                          aria-label="Descartar transferencia"
                          title="Descartar"
                        >
                          <X size={14} aria-hidden="true" /> Descartar
                        </button>
                      </div>
                    )}
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
