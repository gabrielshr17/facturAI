import { useState, type CSSProperties } from "react";
import {
  emitirNotaDebitoFiscal,
  type Cliente,
  type ComprobanteFiscal,
  type EmisorFiscal,
  type Factura,
  type NotaDebitoInput,
} from "@sfr/core";
import { FilePlus } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c, sombra, money } from "../estilos.js";
import { filtrarNumero } from "../utilidades/numero.js";
import { mensajeError } from "../utilidades/errores.js";
import { datosReciboNotaDebito } from "../impresion/representacion.js";
import { imprimirRecibo, type ReciboDatos } from "../impresion/recibo.js";
import { generarPdfRecibo, guardarPdf } from "../impresion/pdf.js";

export interface ModalNotaDebitoProps {
  comprobante: ComprobanteFiscal;
  factura: Factura;
  cliente: Cliente | null;
  emisor: EmisorFiscal | null;
  negocioRecibo: ReciboDatos["negocio"];
  onCerrar: () => void;
  onEmitida: () => void;
  onOcupado: (ocupado: boolean) => void;
}

const TASAS: { valor: NotaDebitoInput["tasaImpuesto"]; etiqueta: string }[] = [
  { valor: 0.18, etiqueta: "ITBIS 18%" },
  { valor: 0.16, etiqueta: "ITBIS 16%" },
  { valor: 0, etiqueta: "Exento" },
];

const CODIGO_CORRIGE_MONTOS = 3;

export function ModalNotaDebito({
  comprobante,
  factura,
  cliente,
  emisor,
  negocioRecibo,
  onCerrar,
  onEmitida,
  onOcupado,
}: ModalNotaDebitoProps) {
  const { secuenciaNcf, comprobanteFiscal, ncfAnulacion, proveedorFiscal } = useRepos();
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [tasa, setTasa] = useState<NotaDebitoInput["tasaImpuesto"]>(0.18);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [emitida, setEmitida] = useState<ComprobanteFiscal | null>(null);

  async function confirmar() {
    setError(null);
    setGuardando(true);
    onOcupado(true);
    try {
      const { comprobante: nota } = await emitirNotaDebitoFiscal(
        {
          secuenciaRepo: secuenciaNcf,
          comprobanteRepo: comprobanteFiscal,
          anulacionRepo: ncfAnulacion,
          proveedorFiscal,
        },
        {
          comprobanteId: comprobante.id,
          concepto,
          monto: Number(monto),
          tasaImpuesto: tasa,
          codigoModificacion: CODIGO_CORRIGE_MONTOS,
          motivo: motivo.trim() || null,
        },
        emisor,
      );
      setEmitida(nota);
      onEmitida();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
      onOcupado(false);
    }
  }

  function cerrar() {
    if (!guardando) onCerrar();
  }

  async function imprimir(salida: "imprimir" | "pdf") {
    if (!emitida) return;
    try {
      const datos = await datosReciboNotaDebito({
        nota: emitida,
        factura,
        cliente,
        negocio: negocioRecibo,
        concepto: concepto.trim(),
        tasaImpuesto: tasa,
        secuencias: secuenciaNcf,
      });
      if (salida === "imprimir") imprimirRecibo(datos);
      else guardarPdf(generarPdfRecibo(datos), `Nota-Debito-${emitida.ncf}.pdf`);
    } catch (e) {
      setError(mensajeError(e));
    }
  }

  return (
    <div style={overlay} onClick={cerrar}>
      <div style={tarjeta} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <FilePlus size={18} /> Nota de débito (E33)
        </h3>
        <p style={{ color: c.gris, fontSize: 13 }}>
          Modifica el comprobante {comprobante.ncf} del ticket #{factura.numero_interno}. Úsela para cobrar un cargo
          adicional, como intereses por mora o flete.
        </p>

        {!emitida && (
          <>
            <label style={s.label}>Concepto</label>
            <input
              autoFocus
              style={s.input}
              value={concepto}
              maxLength={80}
              onChange={(e) => setConcepto(e.target.value)}
            />

            <label style={s.label}>Monto con ITBIS incluido (RD$)</label>
            <input
              style={s.input}
              type="text"
              inputMode="decimal"
              value={monto}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setMonto(filtrarNumero(e.target.value))}
            />

            <label style={s.label}>Impuesto</label>
            <select
              style={s.input}
              value={tasa}
              onChange={(e) => setTasa(Number(e.target.value) as NotaDebitoInput["tasaImpuesto"])}
            >
              {TASAS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>

            <label style={s.label}>Motivo (opcional)</label>
            <textarea
              style={{ ...s.input, minHeight: 50 }}
              value={motivo}
              maxLength={90}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </>
        )}

        {error && (
          <div role="alert" style={s.errorBox}>
            {error}
          </div>
        )}
        {emitida && (
          <div style={{ ...s.errorBox, background: c.verdeFondo, borderColor: c.verde, color: c.verde }}>
            Nota de débito {emitida.ncf} emitida por RD$ {money(emitida.total)}.
          </div>
        )}

        <div style={s.formFooter}>
          {!emitida && (
            <button style={s.boton} disabled={guardando} onClick={() => void confirmar()}>
              {guardando ? "Emitiendo…" : "Emitir nota de débito"}
            </button>
          )}
          {emitida && (
            <>
              <button style={s.boton} onClick={() => void imprimir("imprimir")}>
                Imprimir
              </button>
              <button style={s.botonSecundario} onClick={() => void imprimir("pdf")}>
                Guardar PDF
              </button>
            </>
          )}
          <button style={s.botonSecundario} disabled={guardando} onClick={cerrar}>
            {emitida ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--sfr-overlay)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const tarjeta: CSSProperties = {
  ...s.tarjeta,
  width: 480,
  maxWidth: "90vw",
  maxHeight: "85dvh",
  overflow: "auto",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
};
