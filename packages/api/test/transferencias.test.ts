import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  gmailDisponible: vi.fn(),
  listarCorreosNoLeidos: vi.fn(),
  marcarComoProcesado: vi.fn(),
  geminiDisponible: vi.fn(),
  extraerTransferencia: vi.fn(),
  obtenerClienteDb: vi.fn(),
}));

vi.mock("../src/services/gmail.js", () => ({
  gmailDisponible: m.gmailDisponible,
  listarCorreosNoLeidos: m.listarCorreosNoLeidos,
  marcarComoProcesado: m.marcarComoProcesado,
}));

vi.mock("../src/services/gemini.js", () => ({
  geminiDisponible: m.geminiDisponible,
  extraerTransferencia: m.extraerTransferencia,
}));

vi.mock("../src/services/db.js", () => ({
  obtenerClienteDb: m.obtenerClienteDb,
}));

import { sincronizarTransferencias, actualizarEstado, listarRecientes } from "../src/services/transferencias.js";

const DATOS_EXTRAIDOS = {
  monto: 1250.75,
  fecha: "2026-09-20",
  bancoOrigen: "Banco Popular",
  remitente: "Juana Pérez",
  referencia: "REF-20260920-1",
  confianza: "alta" as const,
  notas: null,
};

const FILA_NOTIFICACION = {
  id: "id-1",
  monto: "1250.75",
  fecha: "2026-09-20",
  banco_origen: "Banco Popular",
  remitente: "Juana Pérez",
  referencia: "REF-20260920-1",
  correo_snippet: "Estimado cliente, le informamos…",
  estado_confirmacion: "pendiente",
  identificado_por: "chatbot",
  created_at: "2026-09-20T10:00:00Z",
};

function dbQueInserta(terminal: { error: { message: string } | null }) {
  const insert = vi.fn().mockReturnValue(terminal);
  m.obtenerClienteDb.mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) });
  return insert;
}

function dbQueEncadena(terminal: { data: unknown; error: { message: string } | null }) {
  const paso = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnValue(terminal),
    maybeSingle: vi.fn().mockReturnValue(terminal),
  };
  const update = vi.fn().mockReturnValue(paso);
  const select = vi.fn().mockReturnValue(paso);
  m.obtenerClienteDb.mockReturnValue({ from: vi.fn().mockReturnValue({ update, select }) });
  return { paso, update };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.gmailDisponible.mockReturnValue(true);
  m.geminiDisponible.mockReturnValue(true);
  m.listarCorreosNoLeidos.mockResolvedValue([]);
});

describe("sincronizarTransferencias", () => {
  it("no hace nada si Gmail no está disponible", async () => {
    m.gmailDisponible.mockReturnValue(false);
    expect(await sincronizarTransferencias()).toBe(0);
    expect(m.listarCorreosNoLeidos).not.toHaveBeenCalled();
  });

  it("no hace nada si Gemini no está disponible", async () => {
    m.geminiDisponible.mockReturnValue(false);
    expect(await sincronizarTransferencias()).toBe(0);
    expect(m.listarCorreosNoLeidos).not.toHaveBeenCalled();
  });

  it("procesa cada correo no leído, lo guarda como pendiente y lo marca como leído", async () => {
    m.listarCorreosNoLeidos.mockResolvedValue([
      { id: "gmail-1", asunto: "Transferencia recibida", cuerpoTexto: "Estimado cliente, recibimos una transferencia de RD$ 1,250.75." },
    ]);
    m.extraerTransferencia.mockResolvedValue(DATOS_EXTRAIDOS);
    const insert = dbQueInserta({ error: null });

    const procesados = await sincronizarTransferencias();

    expect(procesados).toBe(1);
    const fila = insert.mock.calls[0][0];
    expect(fila).toMatchObject({
      estado_confirmacion: "pendiente",
      identificado_por: "chatbot",
      monto: 1250.75,
      banco_origen: "Banco Popular",
      remitente: "Juana Pérez",
      referencia: "REF-20260920-1",
      datos_extraidos_json: DATOS_EXTRAIDOS,
    });
    expect(fila.correo_snippet).toContain("Estimado cliente");
    expect(fila.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(m.marcarComoProcesado).toHaveBeenCalledWith("gmail-1");
  });

  it("si Gemini no puede extraer, el correo queda sin marcar para reintentarlo en el próximo ciclo", async () => {
    m.listarCorreosNoLeidos.mockResolvedValue([{ id: "gmail-mal", asunto: "raro", cuerpoTexto: "texto incomprensible" }]);
    m.extraerTransferencia.mockRejectedValue(new Error("Gemini no devolvió los datos extraídos."));
    const insert = dbQueInserta({ error: null });

    expect(await sincronizarTransferencias()).toBe(0);
    expect(insert).not.toHaveBeenCalled();
    expect(m.marcarComoProcesado).not.toHaveBeenCalled();
  });

  it("si el insert falla, el correo queda sin marcar (el reintento lo vuelve a intentar)", async () => {
    m.listarCorreosNoLeidos.mockResolvedValue([{ id: "gmail-2", asunto: "Transferencia", cuerpoTexto: "cuerpo" }]);
    m.extraerTransferencia.mockResolvedValue(DATOS_EXTRAIDOS);
    dbQueInserta({ error: { message: "duplicated key value violates unique constraint" } });

    expect(await sincronizarTransferencias()).toBe(0);
    expect(m.marcarComoProcesado).not.toHaveBeenCalled();
  });
});

describe("actualizarEstado", () => {
  it("confirma y devuelve la fila ya mapeada a NotificacionTransferencia", async () => {
    const { paso, update } = dbQueEncadena({ data: { ...FILA_NOTIFICACION, estado_confirmacion: "confirmada" }, error: null });

    const resultado = await actualizarEstado("id-1", "confirmada");

    expect(paso.eq).toHaveBeenCalledWith("id", "id-1");
    expect(update.mock.calls[0][0]).toMatchObject({ estado_confirmacion: "confirmada" });
    expect(resultado).not.toBeNull();
    expect(resultado!.estadoConfirmacion).toBe("confirmada");
    expect(resultado!.monto).toBe(1250.75);
    expect(resultado!.bancoOrigen).toBe("Banco Popular");
  });

  it("devuelve null si el id no existe", async () => {
    dbQueEncadena({ data: null, error: null });
    expect(await actualizarEstado("id-inexistente", "descartada")).toBeNull();
  });

  it("lanza si la base responde con error", async () => {
    dbQueEncadena({ data: null, error: { message: "connection refused" } });
    await expect(actualizarEstado("x", "confirmada")).rejects.toThrow("connection refused");
  });
});

describe("listarRecientes", () => {
  it("ordena por created_at descendente y mapea montos numéricos", async () => {
    const { paso } = dbQueEncadena({
      data: [{ ...FILA_NOTIFICACION, monto: "500.50" }, { ...FILA_NOTIFICACION, id: "id-2", monto: null }],
      error: null,
    });

    const lista = await listarRecientes(10);

    expect(paso.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(paso.limit).toHaveBeenCalledWith(10);
    expect(lista).toHaveLength(2);
    expect(lista[0].monto).toBe(500.5);
    expect(lista[1].monto).toBeNull();
  });
});