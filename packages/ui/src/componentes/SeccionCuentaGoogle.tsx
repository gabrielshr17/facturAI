import { useState } from "react";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { s, c } from "../estilos.js";
import { useAuth } from "../contexto/Auth.js";
import { mensajeError } from "../utilidades/errores.js";

/**
 * Sign in with Google (§ Fase 2 opcional, plan.md — Supabase SOLO auth): habilita el modo
 * multi-caja/multiusuario. Nadie tiene que iniciar sesión para usar la app — sin
 * `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (`disponible === false`) esta sección ni se muestra
 * y el resto sigue 100% local/offline, que es el modo por defecto.
 */
export function SeccionCuentaGoogle() {
  const { disponible, sesion, cargando, iniciarSesionGoogle, cerrarSesion } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  if (!disponible) return null;

  async function conectar() {
    setError(null);
    setEnCurso(true);
    try {
      await iniciarSesionGoogle();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnCurso(false);
    }
  }

  async function desconectar() {
    setError(null);
    setEnCurso(true);
    try {
      await cerrarSesion();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <UserRound size={18} /> Cuenta (multi-caja/multiusuario)
      </h3>
      <p style={{ color: c.gris, fontSize: 13, marginTop: 0 }}>
        Opcional: solo hace falta para sincronizar este negocio entre varias cajas o dispositivos. Sin iniciar sesión,
        la app sigue funcionando 100% local, sin internet.
      </p>

      {cargando ? (
        <p style={{ color: c.gris, fontSize: 13 }}>Verificando sesión…</p>
      ) : sesion ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {sesion.avatarUrl ? (
              <img src={sesion.avatarUrl} alt="" width={32} height={32} style={{ borderRadius: 999 }} />
            ) : (
              <UserRound size={32} aria-hidden="true" style={{ color: c.gris }} />
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{sesion.nombre ?? sesion.correo ?? "Cuenta conectada"}</div>
              {sesion.nombre && sesion.correo && <div style={{ fontSize: 12, color: c.gris }}>{sesion.correo}</div>}
            </div>
          </div>
          <button
            style={{ ...s.botonSecundario, display: "inline-flex", alignItems: "center", gap: 6 }}
            disabled={enCurso}
            onClick={desconectar}
          >
            <LogOut size={14} aria-hidden="true" /> {enCurso ? "Cerrando…" : "Cerrar sesión"}
          </button>
        </div>
      ) : (
        <button
          style={{ ...s.boton, display: "inline-flex", alignItems: "center", gap: 6 }}
          disabled={enCurso}
          onClick={conectar}
        >
          <LogIn size={14} aria-hidden="true" /> {enCurso ? "Abriendo…" : "Iniciar sesión con Google"}
        </button>
      )}

      {error && (
        <div role="alert" style={{ ...s.errorBox, marginTop: 12 }}>
          {error}
        </div>
      )}
    </div>
  );
}
