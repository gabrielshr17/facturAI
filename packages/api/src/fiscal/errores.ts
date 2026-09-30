export class DocumentoFiscalInvalidoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "DocumentoFiscalInvalidoError";
  }
}

export class DgiiNoDisponibleError extends Error {
  constructor(
    mensaje: string,
    readonly causa?: unknown,
  ) {
    super(mensaje);
    this.name = "DgiiNoDisponibleError";
  }
}

export class DgiiRespuestaError extends Error {
  constructor(
    mensaje: string,
    readonly status: number,
    readonly cuerpo: string,
  ) {
    super(mensaje);
    this.name = "DgiiRespuestaError";
  }
}
