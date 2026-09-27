import type {
  AlmacenRecepcion,
  AprobacionRecibida,
  EcfRecibidoGuardado,
  FilaEcfRecibido,
} from "../../src/fiscal/recepcion/almacen.js";

type FilaMemoria = FilaEcfRecibido & EcfRecibidoGuardado & { aprobacionXml: string | null };

export function crearAlmacenMemoria() {
  const ecfs: FilaMemoria[] = [];
  const aprobaciones: AprobacionRecibida[] = [];

  function publica(f: FilaMemoria): FilaEcfRecibido {
    const { xml: _xml, acuseXml: _acuse, aprobacionXml: _aprobacion, ...fila } = f;
    return fila;
  }

  const almacen: AlmacenRecepcion = {
    async guardarEcf(ecf) {
      if (ecfs.some((e) => e.rncEmisor === ecf.rncEmisor && e.encf === ecf.encf)) return "duplicado";
      ecfs.push({
        ...ecf,
        id: `r-${ecfs.length + 1}`,
        estadoAprobacion: "pendiente",
        motivoAprobacion: null,
        aprobacionEnviadaAt: null,
        aprobacionXml: null,
        importadoAt: null,
        recibidoAt: "2026-10-01T18:31:05.000Z",
      });
      return "nuevo";
    },
    async guardarAprobacion(aprobacion) {
      aprobaciones.push(aprobacion);
    },
    async listarEcfRecibidos() {
      return ecfs.map(publica);
    },
    async obtenerXmlEcfRecibido(id) {
      return ecfs.find((e) => e.id === id)?.xml ?? null;
    },
    async obtenerEcfRecibido(id) {
      const fila = ecfs.find((e) => e.id === id);
      return fila ? publica(fila) : null;
    },
    async registrarAprobacionEmitida(id, aprobacion) {
      const fila = ecfs.find((e) => e.id === id);
      if (!fila) return;
      fila.estadoAprobacion = aprobacion.aprobado ? "aprobado" : "rechazado";
      fila.motivoAprobacion = aprobacion.motivo;
      fila.aprobacionXml = aprobacion.xml;
      fila.aprobacionEnviadaAt = aprobacion.enviadaAt;
    },
    async marcarImportado(id, fecha) {
      const fila = ecfs.find((e) => e.id === id);
      if (fila) fila.importadoAt = fecha;
    },
  };
  return { almacen, ecfs, aprobaciones };
}
