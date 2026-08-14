import { invoke } from "@tauri-apps/api/core";
import type { AdaptadorImpresora, AdaptadorImpresoraTexto } from "@sfr/ui";

/**
 * Adaptador que conecta `@sfr/ui` (agnóstico de plataforma) con los comandos
 * Rust `listar_impresoras`/`imprimir_ticket_termico` (`src-tauri/src/impresora.rs`),
 * que hablan directo con el Spooler de Windows.
 */
export const adaptadorImpresoraTauri: AdaptadorImpresora = {
  async listar() {
    return await invoke<string[]>("listar_impresoras");
  },
  async imprimir(datos, nombreImpresora) {
    await invoke("imprimir_ticket_termico", { impresora: nombreImpresora, datos: Array.from(datos) });
  },
};

/**
 * Respaldo silencioso sin térmica ESC/POS configurada: texto plano por GDI a
 * la impresora predeterminada de Windows (`imprimir_texto_generico`), sin
 * diálogo del sistema.
 */
export const adaptadorImpresoraTextoTauri: AdaptadorImpresoraTexto = {
  async imprimir(lineas) {
    await invoke("imprimir_texto_generico", { lineas, impresora: null });
  },
};
