import type { SVGProps } from "react";

export interface MarcaProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Lado en px. Misma API que los íconos de lucide (`size={20}`), para que se
   *  usen igual y se puedan intercambiar sin pensarlo. */
  size?: number | string;
}

/**
 * Marca del sistema. La silueta es un recibo — formato vertical, un renglón y el
 * borde inferior rasgado — y la antena con los dos ojos la convierten además en
 * una cara, con el renglón haciendo de boca.
 *
 * Se pinta con `currentColor`, igual que los íconos de lucide: hereda el color
 * de quien la contiene y por lo tanto el del tema, sin que la marca tenga que
 * saber si está en claro u oscuro. Los ojos y la boca son huecos reales
 * (`fill-rule="evenodd"`), no formas del color del fondo, así que se ve bien
 * sobre cualquier superficie.
 *
 * El maestro de esta figura vive en `brand/marca.svg`; los PNG/ICO del
 * instalador y de la PWA salen de ahí con `node brand/generar-iconos.mjs`. Si se
 * toca una, hay que tocar la otra.
 */
export function Marca({ size = 24, ...props }: MarcaProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="currentColor"
      {...props}
    >
      <circle cx="16" cy="2.4" r="1.6" />
      <rect x="15.2" y="2.4" width="1.6" height="4.4" rx="0.8" />
      <path
        fillRule="evenodd"
        d="M7 8.7Q7 6.2 9.5 6.2H22.5Q25 6.2 25 8.7V26.2L22 28.8L19 26.2L16 28.8L13 26.2L10 28.8L7 26.2ZM10.4 13.2A2 2 0 0 1 14.4 13.2A2 2 0 0 1 10.4 13.2ZM17.6 13.2A2 2 0 0 1 21.6 13.2A2 2 0 0 1 17.6 13.2ZM11.5 18.4H20.5V20.6H11.5Z"
      />
    </svg>
  );
}
