import { useCallback, useEffect, useState } from "react";
import { FileCheck2, KeyRound, RefreshCw } from "lucide-react";
import { s, c } from "../estilos.js";
import { useRepos } from "../data/contexto.js";
import { guardarLlaveCaja, obtenerLlaveCaja } from "../data/llaveCaja.js";
import { obtenerEstadoServicioFiscal, type EstadoServicioFiscal } from "../data/fiscalCliente.js";
import { mensajeError } from "../utilidades/errores.js";
import { SeccionRevisionFiscal } from "./SeccionRevisionFiscal.js";

const ETIQUETA_AMBIENTE: Record<EstadoServicioFiscal["ambiente"], string> = {
  testecf: "Pre-certificación (pruebas)",
  certecf: "Certificación",
  ecf: "Producción",
};

const DIAS_AVISO_VENCIMIENTO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function diasHasta(fechaIso: string): number {
  return Math.floor((new Date(fechaIso).getTime() - Date.now()) / MS_POR_DIA);
}

/** Facturación electrónica (§ plan-ecf.md): llave de esta caja y estado del servicio fiscal. */
export function SeccionFacturacionElectronica() {
  const { api, modoFiscal } = useRepos();
  const [llave, setLlave] = useState(obtenerLlaveCaja() ?? "");
  const [estado, setEstado] = useState<EstadoServicioFiscal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [guardada, setGuardada] = useState(false);

  const consultar = useCallback(async () => {
    setConsultando(true);
    setError(null);
    try {
      setEstado(await obtenerEstadoServicioFiscal(api));
    } catch (e) {
      setEstado(null);
      setError(mensajeError(e));
    } finally {
      setConsultando(false);
    }
  }, [api]);

  useEffect(() => {
    if (modoFiscal === "dgii") void consultar();
  }, [modoFiscal, consultar]);

  function guardar() {
    guardarLlaveCaja(llave.trim() || null);
    setGuardada(true);
    void consultar();
  }

  const diasVence = estado?.certificadoVence ? diasHasta(estado.certificadoVence) : null;

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <FileCheck2 size={18} /> Facturación electrónica (DGII)
      </h3>

      {modoFiscal === "simulado" && (
        <p style={{ ...s.errorBox, background: c.amarilloFondo, color: c.amarillo }}>
          Modo simulado: los comprobantes NO se envían a la DGII. Para emitir de verdad, configura
          <code> VITE_FISCAL_MODO=dgii</code> en esta instalación.
        </p>
      )}

      <label style={s.label} htmlFor="llave-caja">
        Llave de esta caja
      </label>
      <p style={{ color: c.gris, fontSize: 13, marginTop: 0 }}>
        La entrega el administrador (se genera una por caja). Autoriza a esta máquina a firmar comprobantes con el
        certificado de la empresa sin iniciar sesión con Google.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          id="llave-caja"
          type="password"
          autoComplete="off"
          style={{ ...s.input, flex: 1, minWidth: 220 }}
          value={llave}
          onChange={(e) => {
            setLlave(e.target.value);
            setGuardada(false);
          }}
        />
        <button
          type="button"
          style={{ ...s.boton, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}
          onClick={guardar}
        >
          <KeyRound size={15} /> {guardada ? "Guardada" : "Guardar llave"}
        </button>
        <button
          type="button"
          style={{ ...s.botonSecundario, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}
          disabled={consultando}
          onClick={() => void consultar()}
        >
          <RefreshCw size={15} /> {consultando ? "Consultando…" : "Probar conexión"}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ ...s.errorBox, marginTop: 12 }}>
          {error}
        </div>
      )}

      {estado && (
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "4px 12px", marginTop: 12 }}>
          <dt style={{ color: c.gris }}>Servicio</dt>
          <dd style={{ margin: 0, color: estado.disponible ? c.verde : c.rojo, fontWeight: 600 }}>
            {estado.disponible ? "Disponible" : `No disponible: ${estado.motivo ?? "sin detalle"}`}
          </dd>
          <dt style={{ color: c.gris }}>Ambiente</dt>
          <dd style={{ margin: 0 }}>{ETIQUETA_AMBIENTE[estado.ambiente]}</dd>
          {estado.rncEmisor && (
            <>
              <dt style={{ color: c.gris }}>RNC emisor</dt>
              <dd style={{ margin: 0 }}>{estado.rncEmisor}</dd>
            </>
          )}
          {estado.certificadoVence && diasVence !== null && (
            <>
              <dt style={{ color: c.gris }}>Certificado vence</dt>
              <dd style={{ margin: 0, color: diasVence <= DIAS_AVISO_VENCIMIENTO ? c.rojo : undefined }}>
                {new Date(estado.certificadoVence).toLocaleDateString("es-DO")}
                {diasVence <= DIAS_AVISO_VENCIMIENTO ? ` — faltan ${Math.max(diasVence, 0)} días, renuévalo` : ""}
              </dd>
            </>
          )}
        </dl>
      )}

      <SeccionRevisionFiscal />
    </div>
  );
}
