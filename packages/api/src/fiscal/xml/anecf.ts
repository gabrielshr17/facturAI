import type { TipoEcf } from "@sfr/core";
import { fechaHoraDgii } from "../formato.js";
import { DocumentoFiscalInvalidoError } from "../errores.js";
import { documentoXml, type Nodo } from "./nodo.js";

export interface RangoAnulacion {
  tipoEcf: TipoEcf;
  desde: string;
  hasta: string;
}

const PATRON_ENCF = /^E(\d{2})(\d{10})$/;

function secuencial(encf: string, tipoEcf: TipoEcf): number {
  const partes = PATRON_ENCF.exec(encf);
  if (!partes) throw new DocumentoFiscalInvalidoError(`"${encf}" no es un e-NCF válido.`);
  if (partes[1] !== tipoEcf) {
    throw new DocumentoFiscalInvalidoError(`El e-NCF ${encf} no corresponde al tipo ${tipoEcf}.`);
  }
  return Number(partes[2]);
}

function cantidad(rango: RangoAnulacion): number {
  const desde = secuencial(rango.desde, rango.tipoEcf);
  const hasta = secuencial(rango.hasta, rango.tipoEcf);
  if (desde > hasta) throw new DocumentoFiscalInvalidoError(`Rango invertido: ${rango.desde} a ${rango.hasta}.`);
  return hasta - desde + 1;
}

export function construirXmlAnecf(rncEmisor: string, rangos: RangoAnulacion[], fechaHora: Date): string {
  if (rangos.length === 0) throw new DocumentoFiscalInvalidoError("No hay rangos que anular.");

  const porTipo = new Map<TipoEcf, RangoAnulacion[]>();
  for (const rango of rangos) {
    cantidad(rango);
    porTipo.set(rango.tipoEcf, [...(porTipo.get(rango.tipoEcf) ?? []), rango]);
  }
  if (porTipo.size > 10) throw new DocumentoFiscalInvalidoError("La DGII admite como máximo 10 tipos por anulación.");

  const total = rangos.reduce((suma, r) => suma + cantidad(r), 0);
  const anulaciones: Nodo[] = [...porTipo.entries()].map(([tipoEcf, rangosTipo], i) => [
    "Anulacion",
    [
      ["NoLinea", String(i + 1)],
      ["TipoeCF", tipoEcf],
      [
        "TablaRangoSecuenciasAnuladaseNCF",
        rangosTipo.map((r): Nodo => [
          "Secuencias",
          [
            ["SecuenciaeNCFDesde", r.desde],
            ["SecuenciaeNCFHasta", r.hasta],
          ],
        ]),
      ],
      ["CantidadeNCFAnulados", String(rangosTipo.reduce((suma, r) => suma + cantidad(r), 0))],
    ],
  ]);

  return documentoXml("ANECF", [
    [
      "Encabezado",
      [
        ["Version", "1.0"],
        ["RncEmisor", rncEmisor],
        ["CantidadeNCFAnulados", String(total)],
        ["FechaHoraAnulacioneNCF", fechaHoraDgii(fechaHora)],
      ],
    ],
    ["DetalleAnulacion", anulaciones],
  ]);
}
