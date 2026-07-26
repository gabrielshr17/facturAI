import { generarComandoAbrirGaveta } from "./escpos.js";

/**
 * Punto de conexión entre `ui` (agnóstico de plataforma) y el transporte real
 * hacia la impresora térmica, que solo existe en el escritorio (Tauri/Rust,
 * vía el Spooler de Windows — ver `packages/desktop/src-tauri/src/impresora.rs`).
 * La PWA (`@sfr/web`) nunca llama a `configurarAdaptadorImpresora`, así que
 * ahí esto queda `null` y `recibo.ts` sigue usando `window.print()`.
 */
export interface AdaptadorImpresora {
  listar: () => Promise<string[]>;
  imprimir: (datos: Uint8Array, nombreImpresora: string) => Promise<void>;
}

let adaptador: AdaptadorImpresora | null = null;

export function configurarAdaptadorImpresora(a: AdaptadorImpresora | null): void {
  adaptador = a;
}

export function hayImpresoraTermicaDisponible(): boolean {
  return adaptador !== null;
}

export async function listarImpresorasTermicas(): Promise<string[]> {
  if (!adaptador) return [];
  return adaptador.listar();
}

const CLAVE_LS = "sfr_impresora_termica_nombre";

/** Cuál impresora Windows usar es una preferencia de esta máquina, no un dato del negocio — se guarda local, no en la base de datos. */
export function obtenerImpresoraSeleccionada(): string | null {
  return localStorage.getItem(CLAVE_LS);
}

export function seleccionarImpresoraTermica(nombre: string | null): void {
  if (nombre) localStorage.setItem(CLAVE_LS, nombre);
  else localStorage.removeItem(CLAVE_LS);
}

export async function imprimirTermico(datos: Uint8Array): Promise<void> {
  if (!adaptador) throw new Error("La impresión térmica no está disponible en esta plataforma.");
  const nombre = obtenerImpresoraSeleccionada();
  if (!nombre) throw new Error("No hay ninguna impresora térmica seleccionada (ver Configuración).");
  await adaptador.imprimir(datos, nombre);
}

/** Pulsa la gaveta de dinero conectada a la impresora térmica (§ hardware). Silencioso si no hay impresora configurada: no bloquea el cobro. */
export async function abrirGavetaTermica(): Promise<void> {
  if (!adaptador || !obtenerImpresoraSeleccionada()) return;
  try {
    await imprimirTermico(generarComandoAbrirGaveta());
  } catch (e) {
    console.error("No se pudo abrir la gaveta:", e);
  }
}
