import { useEffect, useState } from "react";
import { type BitacoraAccion } from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";

const ETIQUETA_ACCION: Record<string, string> = {
  eliminar: "Eliminar",
  cobrar: "Cobrar",
  registrar_compra: "Registrar compra",
  registrar_devolucion: "Registrar devolución",
  cerrar_caja: "Cerrar caja",
  ajustar_existencia: "Ajustar existencia",
};

/** Bitácora de auditoría (§ Caja y auditoría): quién hizo qué y cuándo, solo lectura. */
export function SeccionBitacora() {
  const { bitacora: repo } = useRepos();
  const [lista, setLista] = useState<BitacoraAccion[]>([]);
  const [entidad, setEntidad] = useState("");

  useEffect(() => {
    void repo.listar({ entidad: entidad || null, limite: 50 }).then(setLista);
  }, [repo, entidad]);

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0 }}>📜 Bitácora de auditoría</h3>
        <select style={{ ...s.input, width: 200 }} value={entidad} onChange={(e) => setEntidad(e.target.value)}>
          <option value="">Todas las entidades</option>
          <option value="producto">Producto</option>
          <option value="cliente">Cliente</option>
          <option value="proveedor">Proveedor</option>
          <option value="factura">Factura</option>
          <option value="compra">Compra</option>
          <option value="devolucion">Devolución</option>
          <option value="corte_caja">Corte de caja</option>
        </select>
      </div>

      <table style={s.tabla}>
        <thead>
          <tr>
            <th style={s.th}>Fecha</th>
            <th style={s.th}>Acción</th>
            <th style={s.th}>Entidad</th>
            <th style={s.th}>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr><td style={s.filaVacia} colSpan={4}>Sin registros todavía.</td></tr>
          )}
          {lista.map((r) => (
            <tr key={r.id}>
              <td style={s.td}>{new Date(r.timestamp).toLocaleString("es-DO")}</td>
              <td style={s.td}><span style={s.badge}>{ETIQUETA_ACCION[r.accion] ?? r.accion}</span></td>
              <td style={{ ...s.td, color: c.gris }}>{r.entidad}</td>
              <td style={s.td}>{r.resumen ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
