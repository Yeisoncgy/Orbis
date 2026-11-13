import { useId } from 'react';

/**
 * La marca de Orbis: una órbita con peso (el anillo, más grueso donde guarda la memoria) y una neurona
 * encendida que la recorre. Gira muy despacio; cuando un agente está pensando gira más rápido y su luz late.
 * El mismo dibujo está en public/marca.svg (pestaña del navegador) y en scripts/crear-icono.ts (icono de Windows).
 */
export function Marca({ lado = 28, viva = false }: { lado?: number; viva?: boolean }) {
  const id = useId();
  return (
    <svg className={`signo${viva ? ' viva' : ''}`} width={lado} height={lado} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}a`} x1="5" y1="5" x2="27" y2="27" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7CFFE1" />
          <stop offset="1" stopColor="#19C3FF" />
        </linearGradient>
        <radialGradient id={`${id}n`} cx=".4" cy=".36" r=".75">
          <stop stopColor="#fff" />
          <stop offset=".6" stopColor="#D6FFF6" />
          <stop offset="1" stopColor="#7CFFE1" />
        </radialGradient>
        <radialGradient id={`${id}h`}>
          <stop stopColor="#7CFFE1" stopOpacity=".8" />
          <stop offset="1" stopColor="#7CFFE1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="gira">
        <path fill={`url(#${id}a)`} fillRule="evenodd" d="M16 3.2a12.8 12.8 0 1 0 0 25.6a12.8 12.8 0 1 0 0-25.6Zm1.06 2.14a9.6 9.6 0 1 1 0 19.2a9.6 9.6 0 1 1 0-19.2Z" />
        <circle className="halo" cx="24.45" cy="7.55" r="6.4" fill={`url(#${id}h)`} />
        <circle cx="24.45" cy="7.55" r="2.9" fill={`url(#${id}n)`} />
      </g>
    </svg>
  );
}
