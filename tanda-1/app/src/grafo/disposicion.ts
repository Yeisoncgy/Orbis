import type { Tipo } from '../../../core/src/tipos.ts';

// Cada tipo forma su constelación: el contexto al centro y los demás en anillo, legibles de frente.
// Unidades relativas al radio del grafo.
export const ANCLA: Record<Tipo, [number, number, number]> = {
  contexto: [0, 0, 0],
  decision: [0.92, 0.34, -0.12],
  convencion: [-0.92, 0.34, 0.1],
  modulo: [-0.62, -0.62, -0.08],
  estado: [0.62, -0.62, 0.12],
  glosario: [-0.22, 0.86, -0.2],
  persona: [0.3, -0.92, -0.16],
};

// El espacio crece con la raíz cúbica de las notas: el volumen, no el lado, es lo que se llena
export const radioPara = (notas: number) => Math.max(80, 125 * Math.cbrt(Math.max(notas, 8) / 70));
