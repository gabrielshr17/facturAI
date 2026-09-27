import { useCallback, useEffect, useState } from "react";
import { Check, FileInput, Inbox, X } from "lucide-react";
import { s, c, money } from "../estilos.js";
import { useRepos } from "../data/contexto.js";
import {
  detalleEcfRecibido,
  listarEcfRecibidos,
  responderEcfRecibido,
  type EcfRecibidoResumen,
  type ItemEcfRecibido,
  type ResultadoRespuestaComercial,
} from "../data/fiscalCliente.js";
import { mensajeError } from "../utilidades/errores.js";

export interface EcfParaCompra {
  id: string;
  recibido: EcfRecibidoResumen;
  items: ItemEcfRecibido[];
}

const ETIQUETA_APROBACION: Record<
  EcfRecibidoResumen["estadoAprobacion"],
  { texto: string; color: string; fondo: string }
> = {
  pendiente: { texto: "Por aprobar", color: c.amarillo, fondo: c.amarilloFondo },
  aprobado: { texto: "Aprobado", color: c.verde, fondo: c.verdeFondo },
  rechazado: { texto: "Rechazado", color: c.rojo, fondo: c.rojoFondo },
};

function textoResultado(r: ResultadoRespuestaComercial, aprobado: boolean): { texto: string; error: boolean } {
  if (!r.dgii.aceptada) {
    return { texto: `La DGII no aceptó la respuesta: ${r.dgii.mensajes.join("; ") || "sin detalle"}.`, error: true };
  }
  const accion = aprobado ? "Aprobado" : "Rechazado";
  return r.emisor.entregada
    ? { texto: `${accion}. La DGII y el proveedor ya fueron notificados.`, error: false }
    : { texto: `${accion} ante la DGII. No se pudo avisar al proveedor: ${r.emisor.detalle}`, error: false };
}

/**
 * Comprobantes electrónicos que los proveedores enviaron a la empresa (servicio de recepción DGII):
 * aprobarlos o rechazarlos comercialmente, y pasarlos al formulario de compra.
 */
export function ComprobantesProveedores({
  onUsarEnCompra,
  recargarSeñal,
}: {
  onUsarEnCompra: (ecf: EcfParaCompra) => void;
  recargarSeñal: number;
}) {
  const { api } = useRepos();
  const [recibidos, setRecibidos] = useState<EcfRecibidoResumen[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);
  const [ocupadoId, setOcupadoId] = useState<string | null>(null);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");

  const cargar = useCallback(async () => {
    try {
      setRecibidos(await listarEcfRecibidos(api));
      setError(null);
    } catch (e) {
      setError(mensajeError(e));
    }
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar, recargarSeñal]);

  async function responder(id: string, aprobado: boolean) {
    setOcupadoId(id);
    setMensaje(null);
    try {
      const r = await responderEcfRecibido(api, id, aprobado ? { aprobado } : { aprobado, motivo });
      setMensaje(textoResultado(r, aprobado));
      setRechazandoId(null);
      setMotivo("");
      await cargar();
    } catch (e) {
      setMensaje({ texto: mensajeError(e), error: true });
    } finally {
      setOcupadoId(null);
    }
  }

  async function usar(id: string) {
    setOcupadoId(id);
    try {
      const detalle = await detalleEcfRecibido(api, id);
      onUsarEnCompra({ id, ...detalle });
    } catch (e) {
      setMensaje({ texto: mensajeError(e), error: true });
    } finally {
      setOcupadoId(null);
    }
  }

  const botonFila = { ...s.botonSecundario, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44 };

  return (
    <div style={{ ...s.tarjeta, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <Inbox size={18} /> Comprobantes de proveedores
      </h3>
      <p style={{ color: c.gris, fontSize: 13, marginTop: 0 }}>
        Facturas electrónicas que tus proveedores enviaron a la empresa. Apruébalas o recházalas ante la DGII y
        regístralas como compra.
      </p>

      {error && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}
      {mensaje && (
        <div
          role={mensaje.error ? "alert" : "status"}
          style={{ ...s.errorBox, ...(mensaje.error ? {} : { background: c.verdeFondo, color: c.verde }) }}
        >
          {mensaje.texto}
        </div>
      )}

      <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Proveedor</th>
              <th style={s.th}>e-NCF</th>
              <th style={s.th}>Fecha</th>
              <th style={{ ...s.th, textAlign: "right" }}>Total</th>
              <th style={s.th}>Estado</th>
              <th style={s.th}>
                <span className="sfr-solo-lector">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {recibidos.length === 0 ? (
              <tr>
                <td colSpan={6} style={s.filaVacia}>
                  {error
                    ? "No se pudo cargar la lista."
                    : "Todavía no has recibido comprobantes electrónicos. Llegan solos cuando un proveedor te factura con e-CF."}
                </td>
              </tr>
            ) : (
              recibidos.map((r) => {
                const etiqueta = ETIQUETA_APROBACION[r.estadoAprobacion];
                const ocupado = ocupadoId === r.id;
                return (
                  <tr key={r.id}>
                    <td style={s.td}>
                      {r.razonSocialEmisor || r.rncEmisor}
                      <div style={{ color: c.gris, fontSize: 13 }}>RNC {r.rncEmisor}</div>
                    </td>
                    <td style={s.td}>{r.encf}</td>
                    <td style={s.td}>{r.fechaEmision}</td>
                    <td style={s.tdDerecha}>RD$ {money(r.montoTotal)}</td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, background: etiqueta.fondo, color: etiqueta.color }}>
                        {etiqueta.texto}
                      </span>
                      {r.importadoAt && (
                        <div style={{ color: c.gris, fontSize: 13, marginTop: 4 }}>Registrado en compras</div>
                      )}
                    </td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      {rechazandoId === r.id ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <input
                            style={{ ...s.input, minWidth: 200 }}
                            placeholder="Motivo del rechazo"
                            aria-label={`Motivo del rechazo de ${r.encf}`}
                            value={motivo}
                            autoFocus
                            onChange={(e) => setMotivo(e.target.value)}
                          />
                          <button
                            type="button"
                            style={{ ...s.botonPeligro, minHeight: 44 }}
                            disabled={ocupado || !motivo.trim()}
                            onClick={() => void responder(r.id, false)}
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            style={{ ...s.botonSecundario, minHeight: 44 }}
                            onClick={() => setRechazandoId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {r.estadoAprobacion === "pendiente" && (
                            <>
                              <button
                                type="button"
                                style={botonFila}
                                disabled={ocupado}
                                onClick={() => void responder(r.id, true)}
                              >
                                <Check size={15} /> Aprobar
                              </button>
                              <button
                                type="button"
                                style={botonFila}
                                disabled={ocupado}
                                onClick={() => {
                                  setRechazandoId(r.id);
                                  setMotivo("");
                                }}
                              >
                                <X size={15} /> Rechazar
                              </button>
                            </>
                          )}
                          {!r.importadoAt && r.estadoAprobacion !== "rechazado" && (
                            <button type="button" style={botonFila} disabled={ocupado} onClick={() => void usar(r.id)}>
                              <FileInput size={15} /> Registrar compra
                            </button>
                          )}
                        </div>
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
