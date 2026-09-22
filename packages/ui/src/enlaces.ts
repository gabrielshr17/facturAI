/**
 * Punto de conexión entre `ui` y el transporte real para abrir enlaces externos
 * en el navegador del sistema (mismo patrón que `impresion/termica.ts`). En el
 * escritorio (Tauri) se registra el `openUrl` del plugin-opener; sin adaptador —
 * PWA o navegador — se cae a `window.open`.
 */
export interface AdaptadorAbrirEnlace {
  abrir: (url: string) => Promise<void>;
}

let adaptador: AdaptadorAbrirEnlace | null = null;

export function configurarAbrirEnlaceExterno(a: AdaptadorAbrirEnlace | null): void {
  adaptador = a;
}

export async function abrirEnlaceExterno(url: string): Promise<void> {
  if (adaptador) {
    await adaptador.abrir(url);
    return;
  }
  window.open(url, "_blank", "noopener");
}