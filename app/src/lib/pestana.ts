// La pestaña del navegador: el título dice qué cerebro se mira y si hay algo por revisar, y mientras un agente
// piensa la neurona de la marca da vueltas en el icono, para que se note aunque Orbis esté en otra pestaña.
import { useEffect } from 'react';

const CUADROS = 24;
let cuadros: string[] | undefined;

/** la marca con la neurona en un punto de su órbita, dibujada igual que public/marca.svg */
function dibujar(giro: number): string {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return '';
  g.scale(2, 2);
  const fondo = g.createLinearGradient(0, 0, 32, 32);
  fondo.addColorStop(0, '#0C3D66');
  fondo.addColorStop(0.5, '#06223F');
  fondo.addColorStop(1, '#020C1B');
  g.fillStyle = fondo;
  g.beginPath();
  g.roundRect(0, 0, 32, 32, 7.5);
  g.fill();
  g.translate(16, 16);
  g.scale(0.88, 0.88);
  g.rotate(giro);
  const anillo = g.createLinearGradient(-11, -11, 11, 11);
  anillo.addColorStop(0, '#7CFFE1');
  anillo.addColorStop(1, '#19C3FF');
  g.fillStyle = anillo;
  g.beginPath();
  g.arc(0, 0, 12.8, 0, 7);
  g.arc(1.06, -1.06, 9, 0, 7);
  g.fill('evenodd');
  const x = 8.24, y = -8.24;
  const halo = g.createRadialGradient(x, y, 0, x, y, 7.4);
  halo.addColorStop(0, 'rgba(124,255,225,.85)');
  halo.addColorStop(1, 'rgba(124,255,225,0)');
  g.fillStyle = halo;
  g.fillRect(x - 8, y - 8, 16, 16);
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, 3.3, 0, 7);
  g.fill();
  return c.toDataURL('image/png');
}

export function usePestana(cerebro: string | undefined, pensando: boolean, porRevisar: number) {
  useEffect(() => {
    if (!cerebro) return;
    document.title = `${porRevisar ? `(${porRevisar}) ` : ''}${pensando ? `${cerebro} está pensando` : cerebro} · Orbis`;
  }, [cerebro, pensando, porRevisar]);

  useEffect(() => {
    const enlace = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!enlace || !pensando || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const reposo = { href: enlace.href, type: enlace.type };
    try {
      cuadros ??= Array.from({ length: CUADROS }, (_, n) => dibujar((n / CUADROS) * Math.PI * 2));
    } catch {
      return;
    }
    if (!cuadros[0]) return;
    let n = 0;
    enlace.type = 'image/png';
    const t = setInterval(() => {
      enlace.href = (cuadros as string[])[(n = (n + 1) % CUADROS)];
    }, 150);
    return () => {
      clearInterval(t);
      enlace.type = reposo.type;
      enlace.href = reposo.href;
    };
  }, [pensando]);
}
