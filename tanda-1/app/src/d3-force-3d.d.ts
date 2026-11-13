// d3-force-3d no trae tipos: solo se usa la fuerza de colisión
declare module 'd3-force-3d' {
  interface FuerzaColision<N> {
    (alpha: number): void;
    radius(r: (n: N) => number): FuerzaColision<N>;
    strength(s: number): FuerzaColision<N>;
    iterations(i: number): FuerzaColision<N>;
  }
  export function forceCollide<N>(): FuerzaColision<N>;
}
