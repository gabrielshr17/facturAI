import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import type { ComprobanteFiscal, NcfAnulacion } from "@sfr/core";
import { s, c, money } from "../estilos.js";
import { useRepos } from "../data/contexto.js";
import { ejecutarCicloFiscal, type ResumenCicloFiscal } from "../data/seguimientoFiscal.js";
import { mensajeError } from "../utilidades/errores.js";

interface Situacion {
  etiqueta: string;
  color: string;
  fondo: string;
  detalle: string | null;
}

function situacionComprobante(comprobante: ComprobanteFiscal): Situacion {
  if (comprobante.estado_dgii === "rechazado") {
    return {
      etiqueta: "Rechazado por la DGII",
      color: c.rojo,
      fondo: c.rojoFondo,
      detalle: `${comprobante.motivo_rechazo ?? "Sin motivo indicado."} No tiene validez fiscal: revísalo con tu contador.`,
    };
  }
  if (comprobante.entrega_estado === "rechazado") {
    return {
      etiqueta: "El comprador no lo recibió",
      color: c.rojo,
      fondo: c.rojoFondo,
      detalle: comprobante.entrega_detalle,
    };
  }
  return {
    etiqueta: "En validación",
    color: c.amarillo,
    fondo: c.amarilloFondo,
    detalle: "La DGII aún no responde. Se consulta sola cada 5 minutos.",
  };
}

function situacionNumero(numero: NcfAnulacion): Situacion {
  if (numero.estado === "utilizado") {
    return {
      etiqueta: "La DGII lo tiene",
      color: c.rojo,
      fondo: c.rojoFondo,
      detalle: `${numero.ultimo_mensaje_dgii ?? ""} Existe en la DGII sin venta en esta caja: revísalo con tu contador.`,
    };
  }
  return {
    etiqueta: "Por anular",
    color: c.amarillo,
    fondo: c.amarilloFondo,
    detalle: numero.ultimo_mensaje_dgii ?? numero.motivo,
  };
}

function resumenTexto(r: ResumenCicloFiscal): string {
  const partes = [
    r.actualizados ? `${r.actualizados} comprobante(s) actualizados` : null,
    r.entregados ? `${r.entregados} entregado(s) a compradores` : null,
    r.anulados ? `${r.anulados} número(s) anulados` : null,
    r.errores ? `${r.errores} consulta(s) fallaron y se reintentarán` : null,
  ].filter(Boolean);
  return partes.length ? `Sincronizado: ${partes.join(", ")}.` : "Sincronizado. No hubo cambios.";
}

const encabezado: CSSProperties = { margin: "20px 0 8px", fontSize: 15 };

/** Lo fiscal que requiere atención (§ plan-ecf.md D2): comprobantes sin validez y números perdidos. */
export function SeccionRevisionFiscal() {
  const repos = useRepos();
  const { comprobanteFiscal, ncfAnulacion, modoFiscal } = repos;
  const [comprobantes, setComprobantes] = useState<ComprobanteFiscal[]>([]);
  const [numeros, setNumeros] = useState<NcfAnulacion[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [paraRevision, pendientes, utilizados] = await Promise.all([
        comprobanteFiscal.listarParaRevision(),
        ncfAnulacion.listarPendientes(),
        ncfAnulacion.listarUtilizados(),
      ]);
      setComprobantes(paraRevision);
      setNumeros([...utilizados, ...pendientes]);
    } catch (e) {
      setMensaje({ texto: mensajeError(e), error: true });
    }
  }, [comprobanteFiscal, ncfAnulacion]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function sincronizar() {
    setSincronizando(true);
    setMensaje(null);
    try {
      setMensaje({ texto: resumenTexto(await ejecutarCicloFiscal(repos)), error: false });
    } catch (e) {
      setMensaje({ texto: mensajeError(e), error: true });
    } finally {
      setSincronizando(false);
      await cargar();
    }
  }

  async function marcarRevisado(id: string) {
    try {
      await ncfAnulacion.marcarRevisado(id);
      await cargar();
    } catch (e) {
      setMensaje({ texto: mensajeError(e), error: true });
    }
  }

  return (
    <div style={{ marginTop: 20, borderTop: `1px solid ${c.borde}`, paddingTop: 16 }}>
      <div
        style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}
      >
        <h4 style={{ margin: 0, fontSize: 16 }}>Por resolver</h4>
        <button
          type="button"
          style={{ ...s.botonSecundario, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 }}
          disabled={sincronizando || modoFiscal !== "dgii"}
          title={modoFiscal !== "dgii" ? "Disponible cuando la caja emite de verdad con la DGII" : undefined}
          onClick={() => void sincronizar()}
        >
          <RefreshCw size={15} /> {sincronizando ? "Sincronizando…" : "Sincronizar con la DGII ahora"}
        </button>
      </div>

      {mensaje && (
        <div
          role={mensaje.error ? "alert" : "status"}
          style={{
            ...s.errorBox,
            marginTop: 12,
            ...(mensaje.error ? {} : { background: c.verdeFondo, color: c.verde }),
          }}
        >
          {mensaje.texto}
        </div>
      )}

      <h5 style={encabezado}>Comprobantes</h5>
      <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>e-NCF</th>
              <th style={s.th}>Fecha</th>
              <th style={{ ...s.th, textAlign: "right" }}>Total</th>
              <th style={s.th}>Situación</th>
            </tr>
          </thead>
          <tbody>
            {comprobantes.length === 0 ? (
              <tr>
                <td colSpan={4} style={s.filaVacia}>
                  Todo al día: ningún comprobante en validación, rechazado o sin entregar.
                </td>
              </tr>
            ) : (
              comprobantes.map((comprobante) => {
                const situacion = situacionComprobante(comprobante);
                return (
                  <tr key={comprobante.id}>
                    <td style={s.td}>{comprobante.ncf}</td>
                    <td style={s.td}>{new Date(comprobante.fecha_emision).toLocaleDateString("es-DO")}</td>
                    <td style={s.tdDerecha}>RD$ {money(comprobante.total)}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: situacion.fondo, color: situacion.color }}>
                        {situacion.etiqueta}
                      </span>
                      {situacion.detalle && (
                        <div style={{ color: c.gris, fontSize: 13, marginTop: 4 }}>{situacion.detalle}</div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <h5 style={encabezado}>Números de comprobante sin venta</h5>
      <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>e-NCF</th>
              <th style={s.th}>Situación</th>
              <th style={s.th}>
                <span className="sfr-solo-lector">Acción</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {numeros.length === 0 ? (
              <tr>
                <td colSpan={3} style={s.filaVacia}>
                  No hay números perdidos. Si una venta fiscal falla, su número aparece aquí hasta anularse ante la
                  DGII.
                </td>
              </tr>
            ) : (
              numeros.map((numero) => {
                const situacion = situacionNumero(numero);
                return (
                  <tr key={numero.id}>
                    <td style={s.td}>{numero.ncf}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: situacion.fondo, color: situacion.color }}>
                        {situacion.etiqueta}
                      </span>
                      {situacion.detalle && (
                        <div style={{ color: c.gris, fontSize: 13, marginTop: 4 }}>{situacion.detalle}</div>
                      )}
                    </td>
                    <td style={s.tdDerecha}>
                      {numero.estado === "utilizado" && (
                        <button
                          type="button"
                          style={{
                            ...s.botonSecundario,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            minHeight: 44,
                          }}
                          onClick={() => void marcarRevisado(numero.id)}
                        >
                          <CheckCheck size={15} /> Marcar revisado
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
