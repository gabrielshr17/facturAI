/**
 * Etiqueta de botón con su atajo separado del nombre: `"Cobrar (F12)"` se muestra como
 * `Cobrar ⌜F12⌝`, con la tecla en un chip apagado (§ `.sfr-kbd`).
 *
 * Escrito entre paréntesis dentro del mismo texto, el atajo se lee como parte del nombre del botón
 * y llena la pantalla de ruido — y en una pantalla táctil, donde no hay teclas de función, es ruido
 * que además no sirve para nada. Por eso `ocultarAtajo` lo elimina en vez de solo apagarlo.
 *
 * Si el texto no termina en un paréntesis, se devuelve tal cual: pasarlo por acá siempre es seguro.
 */
export function EtiquetaAtajo({ texto, ocultarAtajo = false }: { texto: string; ocultarAtajo?: boolean }) {
  const m = texto.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!m) return <>{texto}</>;
  const [, base, atajo] = m;
  if (ocultarAtajo) return <>{base}</>;
  return (
    <>
      {base}
      {/* `aria-hidden`: el lector de pantalla ya recibe el atajo por el `title`/`aria-label` del
          botón; leerlo dos veces solo alarga el anuncio. */}
      <kbd className="sfr-kbd" aria-hidden="true">{atajo}</kbd>
    </>
  );
}
