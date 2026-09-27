import type { AlmacenRecepcion, AprobacionRecibida, EcfRecibidoGuardado } from "../../src/fiscal/recepcion/almacen.js";

export function crearAlmacenMemoria() {
  const ecfs: (EcfRecibidoGuardado & { id: string })[] = [];
  const aprobaciones: AprobacionRecibida[] = [];
  const almacen: AlmacenRecepcion = {
    async guardarEcf(ecf) {
      if (ecfs.some((e) => e.rncEmisor === ecf.rncEmisor && e.encf === ecf.encf)) return "duplicado";
      ecfs.push({ ...ecf, id: `r-${ecfs.length + 1}` });
      return "nuevo";
    },
    async guardarAprobacion(aprobacion) {
      aprobaciones.push(aprobacion);
    },
  };
  return { almacen, ecfs, aprobaciones };
}
