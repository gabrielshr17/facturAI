import { Landmark, Mail, Inbox, Cloud, ExternalLink } from "lucide-react";
import { s, c } from "../estilos.js";
import { abrirEnlaceExterno } from "../enlaces.js";

const ENLACES = [
  {
    etiqueta: "Abrir Gmail",
    url: "https://mail.google.com/",
    descripcion: "Configura el reenvío automático hacia la casilla dedicada.",
    Icono: Mail,
  },
  {
    etiqueta: "Abrir Outlook",
    url: "https://outlook.live.com/mail/",
    descripcion: "Configura el reenvío automático hacia la casilla dedicada.",
    Icono: Inbox,
  },
  {
    etiqueta: "Google Cloud Console",
    url: "https://console.cloud.google.com/",
    descripcion: "Crea el OAuth client de la casilla dedicada (paso único).",
    Icono: Cloud,
  },
];

/**
 * Configuración única de "Últimas transferencias recibidas" (§ plan.md): el banco
 * avisa por correo, y el backend lee las notificaciones de una casilla Gmail dedicada
 * (a la que las cuentas reales reenvían). Estos botones abren en el navegador las
 * páginas de correo para que el dueño haga ese setup a mano — sin credenciales del
 * banco guardadas en ningún lado.
 */
export function SeccionSetupTransferencias() {
  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Landmark size={18} /> Transferencias por correo (setup)
      </h3>
      <p style={{ color: c.gris, fontSize: 13 }}>
        Los avisos de transferencia llegan al Gmail/Outlook del negocio y se reenvían a una casilla
        Gmail dedicada que el backend lee. Esto se configura una sola vez: abre cada página para
        iniciar sesión y crear el reenvío. El paso a paso está en <code>packages/api/README.md</code>.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ENLACES.map(({ etiqueta, url, descripcion, Icono }) => (
          <div key={etiqueta} style={{ maxWidth: 220 }}>
            <button
              style={{ ...s.botonSecundario, display: "inline-flex", alignItems: "center", gap: 6 }}
              onClick={() => void abrirEnlaceExterno(url)}
            >
              <Icono size={14} aria-hidden="true" /> {etiqueta} <ExternalLink size={12} aria-hidden="true" />
            </button>
            <p style={{ color: c.gris, fontSize: 12, marginTop: 4, marginBottom: 0 }}>{descripcion}</p>
          </div>
        ))}
      </div>
    </div>
  );
}