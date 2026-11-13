// El tejido: neuronas (notas) y fibras (enlaces) vivas en un lienzo, con cámara, profundidad y física propias.
// Cada neurona se puede agarrar y jalar: sus fibras se estiran y arrastran a las notas con las que se comunica.
import type { Tipo } from '../../../core/src/tipos.ts';
import { COLOR_TIPO, ETIQUETA_TIPO, ORDEN_TIPOS, SINGULAR_TIPO } from '../lib/tipos.ts';

export interface Neurona {
  id: string;
  titulo: string;
  tipo: Tipo;
  tema: string;
  grado: number;
  lecturas: number;
  reciente: boolean;
  revisar: boolean;
}

type V3 = [number, number, number];

interface Punto extends Neurona {
  /** su sitio en reposo */
  a: V3;
  p: V3;
  v: V3;
  r: number;
  base: number;
  fase: number;
  /** cuánta luz tiene ahora (se acerca suave a la que le toca) */
  luz: number;
  esc: number;
  retraso: number;
}

export interface Tejido {
  datos(neuronas: Neurona[], fibras: [string, string][]): void;
  /** enfoca una nota: la cámara vuela hasta ella y se encienden sus conexiones */
  elegir(id?: string): void;
  /** notas del pensamiento en curso, en orden */
  hilo(ids: string[]): void;
  pulso(ids: string[]): void;
  soloTipo(tipo?: Tipo): void;
  /** resultados de una búsqueda: se encienden y lo demás se apaga */
  resaltar(ids: string[]): void;
  girar(v: boolean): void;
  /** espacio que tapan los paneles, para centrar el tejido en lo que queda libre */
  margenes(m: { izquierda: number; derecha: number; arriba: number; abajo: number }): void;
  recentrar(): void;
  /** devuelve a su sitio la neurona que se sacó y las notas que salieron con ella */
  recoger(): void;
  /** saca una neurona sin arrastrarla: sale al centro, o toma el lugar de la que ya estaba fuera */
  sacar(id: string): void;
  /** con una neurona fuera: flechas para recorrer sus notas, Enter para sacar la señalada, Retroceso para volver */
  tecla(tecla: string): boolean;
  destruir(): void;
}

interface Oyentes {
  alElegir(id?: string): void;
  /** fija: la tarjeta va en un sitio dado (junto al abanico) en vez de seguir al cursor */
  alPasar(id: string | undefined, x: number, y: number, fija?: boolean): void;
  /** una neurona se sacó del tejido (o volvió, sin id): cuántas la citan y a cuántas cita */
  alJalar(id: string | undefined, laCitan: number, citaA: number, camino: string[]): void;
}

// azar con semilla sacada de un texto: cada nota cae siempre en el mismo sitio
function azarDe(texto: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < texto.length; i++) s = Math.imul(s ^ texto.charCodeAt(i), 16777619);
  return () => ((s = (s + 0x6d2b79f5) >>> 0), (((s ^ (s >>> 15)) * (1 | s)) >>> 0) / 4294967296);
}
const gauss = (r: () => number) => (r() + r() + r() + r() - 2) / 1.2;
const limitar = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const suave = (u: number) => 1 - (1 - limitar(u, 0, 1)) ** 3;
const rebote = (u: number) => {
  const x = limitar(u, 0, 1) - 1;
  return 1 + 2.2 * x * x * x + 1.2 * x * x;
};
const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');

function lienzoDe(lado: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  return [c, c.getContext('2d') as CanvasRenderingContext2D];
}

// la neurona: un núcleo blanco, su color y un halo que se pierde
function sello(color: string): HTMLCanvasElement {
  const [c, g] = lienzoDe(128);
  const d = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  d.addColorStop(0, '#ffffff');
  d.addColorStop(0.06, '#ffffff');
  d.addColorStop(0.15, color);
  d.addColorStop(0.2, `rgba(${rgb(color)},.9)`);
  d.addColorStop(0.27, `rgba(${rgb(color)},.2)`);
  d.addColorStop(0.5, `rgba(${rgb(color)},.07)`);
  d.addColorStop(1, `rgba(${rgb(color)},0)`);
  g.fillStyle = d;
  g.fillRect(0, 0, 128, 128);
  return c;
}
// la misma, desenfocada: lo que queda delante o detrás del plano de enfoque
function borroso(origen: HTMLCanvasElement, px: number): HTMLCanvasElement {
  const [c, g] = lienzoDe(128);
  g.filter = `blur(${px}px)`;
  g.drawImage(origen, 14, 14, 100, 100);
  return c;
}
function nube(color: string): HTMLCanvasElement {
  const [c, g] = lienzoDe(256);
  const d = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  d.addColorStop(0, `rgba(${rgb(color)},.2)`);
  d.addColorStop(0.5, `rgba(${rgb(color)},.07)`);
  d.addColorStop(1, `rgba(${rgb(color)},0)`);
  g.fillStyle = d;
  g.fillRect(0, 0, 256, 256);
  return c;
}

// el destello de las neuronas más encendidas: una raya de luz horizontal, como en una lente
function destello(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const d = g.createLinearGradient(0, 0, 256, 0);
  d.addColorStop(0, 'rgba(170,235,255,0)');
  d.addColorStop(0.5, 'rgba(225,250,255,.95)');
  d.addColorStop(1, 'rgba(170,235,255,0)');
  g.fillStyle = d;
  g.fillRect(0, 0, 256, 32);
  g.globalCompositeOperation = 'destination-in';
  const v = g.createLinearGradient(0, 0, 0, 32);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.5, 'rgba(0,0,0,1)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, 256, 32);
  return c;
}

// siete regiones repartidas en una esfera; dentro de cada una, un grumo por tema
const CENTRO: V3[] = ORDEN_TIPOS.map((_, t) => {
  const y = 1 - (t + 0.5) * (2 / 7);
  const r = Math.sqrt(1 - y * y);
  const a = t * 2.39996;
  return [Math.cos(a) * r * 0.78, y * 0.58, Math.sin(a) * r * 0.78];
});

function situar(neuronas: Neurona[], pares: [string, string][]): Punto[] {
  const puntos = sembrar(neuronas);
  const n = puntos.length;
  if (n < 2) return puntos;
  const indice = new Map(puntos.map((d, i) => [d.id, i]));
  const lazos: [number, number][] = [];
  for (const [a, b] of pares) {
    const i = indice.get(a), j = indice.get(b);
    if (i !== undefined && j !== undefined && i !== j) lazos.push([i, j]);
  }
  const pos = puntos.map((d) => [d.a[0], d.a[1], d.a[2]]);
  // el hueco que cada neurona defiende a su alrededor: menor cuantas más haya
  const hueco = limitar(1.05 / Math.cbrt(n), 0.05, 0.2);
  const vueltas = Math.max(2, Math.min(70, Math.floor(9e6 / (n * n))));
  for (let v = 0; v < vueltas; v++) {
    const frio = 1 - v / vueltas;
    for (const [i, j] of lazos) {
      const A = pos[i], B = pos[j];
      const dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      if (d < hueco * 2.2) continue;
      const t = ((d - hueco * 2.2) / d) * 0.012 * frio;
      const pi = 1 / Math.sqrt(puntos[i].grado + 1), pj = 1 / Math.sqrt(puntos[j].grado + 1);
      A[0] += dx * t * pi; A[1] += dy * t * pi; A[2] += dz * t * pi;
      B[0] -= dx * t * pj; B[1] -= dy * t * pj; B[2] -= dz * t * pj;
    }
    for (let i = 0; i < n; i++) {
      const A = pos[i];
      for (let j = i + 1; j < n; j++) {
        const B = pos[j];
        const dx = B[0] - A[0];
        if (dx > hueco || dx < -hueco) continue;
        const dy = B[1] - A[1];
        if (dy > hueco || dy < -hueco) continue;
        const dz = B[2] - A[2], d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= hueco * hueco) continue;
        const d = Math.sqrt(d2) || 1e-4, e = ((hueco - d) / d) * 0.5 * (0.35 + 0.65 * frio);
        A[0] -= dx * e; A[1] -= dy * e; A[2] -= dz * e;
        B[0] += dx * e; B[1] += dy * e; B[2] += dz * e;
      }
      // nadie se aleja del todo de su región
      const d = puntos[i];
      A[0] += (d.a[0] - A[0]) * 0.012; A[1] += (d.a[1] - A[1]) * 0.012; A[2] += (d.a[2] - A[2]) * 0.012;
    }
  }
  // el conjunto se ajusta a una esfera de radio fijo, para que la cámara siempre lo encuadre igual
  // (se mide con el percentil 94: una nota suelta y lejana no encoge a todas las demás)
  const radios = pos.map((A) => Math.hypot(A[0], A[1] * 1.25, A[2])).sort((a, b) => a - b);
  const ajuste = 1 / (radios[Math.floor((n - 1) * 0.94)] || 1);
  puntos.forEach((d, i) => {
    d.a = [pos[i][0] * ajuste, pos[i][1] * ajuste, pos[i][2] * ajuste];
    d.p = [d.a[0], d.a[1], d.a[2]];
    d.retraso = 200 + Math.hypot(d.a[0], d.a[1], d.a[2]) * 900 + (d.fase / 6.283) * 260;
  });
  return puntos;
}

function sembrar(neuronas: Neurona[]): Punto[] {
  const porTipo = new Map<Tipo, number>();
  for (const n of neuronas) porTipo.set(n.tipo, (porTipo.get(n.tipo) ?? 0) + 1);
  return neuronas.map((n) => {
    const ancho = 0.075 + 0.017 * Math.sqrt(porTipo.get(n.tipo) ?? 1);
    const g = azarDe(`${n.tipo}/${n.tema}`);
    const grumo = [gauss(g) * ancho * 1.5, gauss(g) * ancho * 1.5, gauss(g) * ancho * 1.5];
    const r = azarDe(n.id);
    const c = CENTRO[ORDEN_TIPOS.indexOf(n.tipo)];
    const a: V3 = [c[0] + grumo[0] + gauss(r) * ancho * 0.64, c[1] + grumo[1] + gauss(r) * ancho * 0.64, c[2] + grumo[2] + gauss(r) * ancho * 0.64];
    return {
      ...n,
      a,
      p: [a[0], a[1], a[2]],
      v: [0, 0, 0],
      r: 6.5 + Math.sqrt(n.grado) * 2.1 + Math.min(5, Math.log2(1 + n.lecturas) * 1.6),
      base: 0.6 + Math.min(0.4, n.lecturas * 0.06 + n.grado * 0.012),
      fase: r() * 6.283,
      luz: 0,
      esc: 1,
      retraso: 200 + Math.hypot(a[0], a[1], a[2]) * 900 + r() * 260,
    };
  });
}

const FIBRAS_MAXIMAS = 9000;
/** al sacar una neurona, cuántas notas caben a cada lado y cuánto se separan */
const POR_LADO = 13;
const PASO = 31;
interface Rama {
  i: number;
  /** -1: la cita (sale a la izquierda); 1: es citada por ella (sale a la derecha) */
  lado: 1 | -1;
  k: number;
  m: number;
  mutua: boolean;
}
const sitio = (a: Rama): [number, number] => {
  const u = a.m > 1 ? (a.k / (a.m - 1)) * 2 - 1 : 0;
  return [a.lado * (172 + 52 * (1 - u * u)), (a.k - (a.m - 1) / 2) * PASO];
};
const IMPULSO_MS = 9000;

export function crearTejido(lienzo: HTMLCanvasElement, oyentes: Oyentes): Tejido {
  const ctx = lienzo.getContext('2d') as CanvasRenderingContext2D;
  const nitidos = ORDEN_TIPOS.map((t) => sello(COLOR_TIPO[t]));
  const sellos = nitidos.map((s) => [s, borroso(s, 3), borroso(s, 7)]);
  const nubes = ORDEN_TIPOS.map((t) => nube(COLOR_TIPO[t]));
  const chispa = sello('#B8FFF2');
  const mota = borroso(sello('#9FE8FF'), 5);
  const raya = destello();
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let puntos: Punto[] = [];
  let indice = new Map<string, number>();
  let fibras: [number, number, number, number][] = []; // a, b, curva, largo en reposo
  let porColor: number[][] = ORDEN_TIPOS.map(() => []);
  let vecinas = new Map<number, number[]>();
  let ambiente: number[] = [];
  let elegida = -1;
  let jalada = -1;
  /** la neurona sacada del tejido, con sus notas desplegadas a los lados; se queda así hasta recogerla */
  let desplegada = -1;
  let abanico: Rama[] = [];
  let enAbanico = new Map<number, number>();
  let ocultas = [0, 0];
  let filas = 1;
  let salio = 0;
  /** todas las notas de cada lado (la citan / cita a), en orden; el abanico muestra una ventana de cada una */
  let lados: number[][] = [[], []];
  let desde = [0, 0];
  /** cuándo le toca salir a cada nota del abanico */
  let entro = new Map<number, number>();
  /** el camino recorrido de neurona en neurona, y la anterior a la actual */
  let rastro: number[] = [];
  let viene = -1;
  /** a dónde se desliza la neurona sacada sin arrastrar */
  let destino: [number, number] | 'centro' | undefined;
  /** dónde quedó pintado cada rótulo del abanico, para poder señalarlo y tocarlo */
  let cajas: { i: number; x: number; y: number; w: number }[] = [];
  const ondas: { p: V3; t: number }[] = [];
  let velGiro = 0;
  let rueda = 0;
  let umbralFaro = Infinity;
  let salientes = new Map<number, Set<number>>();
  let regiones: { t: Tipo; c: V3; r: number; n: number }[] = [];
  let veloLuz = 0;
  let veloEn = [0, 0];
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const [brillo, gBrillo] = lienzoDe(4);
  const [brillo2, gBrillo2] = lienzoDe(4);
  let sobre = -1;
  let hilo: number[] = [];
  let resaltadas = new Set<number>();
  let solo: Tipo | undefined;
  let gira = true;
  let margen = { izquierda: 0, derecha: 0, arriba: 0, abajo: 0 };
  const cam = { ry: 1.2, rx: 0.2, zoom: 0.62, vry: 0, vrx: 0 };
  const meta = { ry: 1.2, rx: 0.2, zoom: 1, volando: false };
  let ancho = 0;
  let alto = 0;
  let escala = 1;
  let P: number[][] = [];
  let vivo = true;
  let despierto = 0;
  let nacio = performance.now();
  let previo = performance.now();
  let fibraLuz = 1;
  let arrastre: { x: number; y: number; ry: number; rx: number; movio: boolean; nodo: number; z: number; px: number; py: number; ox: number; oy: number; zv: number } | undefined;
  /** neurona → momento en que la tocó un agente */
  const tocadas = new Map<number, number>();
  // plancton: motas que flotan en el agua, delante y detrás del tejido
  const azar = azarDe('plancton');
  const plancton = Array.from({ length: 130 }, () => ({ p: [(azar() - 0.5) * 3.6, (azar() - 0.5) * 2.6, (azar() - 0.5) * 3.6] as V3, v: 0.00002 + azar() * 0.00005, f: azar() * 6.283, r: 1 + azar() * 2.4 }));

  function medir() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    ancho = lienzo.clientWidth;
    alto = lienzo.clientHeight;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(alto * dpr);
    brillo.width = brillo2.width = Math.max(4, Math.ceil(ancho / 4));
    brillo.height = brillo2.height = Math.max(4, Math.ceil(alto / 4));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const observador = new ResizeObserver(medir);
  observador.observe(lienzo);
  medir();

  let cy = 1, sy = 0, cx = 1, sx = 0, centroX = 0, centroY = 0;
  let base = 0;
  function camara(k: number) {
    // paralaje: el tejido se inclina apenas hacia donde va el cursor
    if (!arrastre && desplegada < 0) {
      par.x += (par.tx - par.x) * k * 0.3;
      par.y += (par.ty - par.y) * k * 0.3;
    }
    cy = Math.cos(cam.ry + par.x);
    sy = Math.sin(cam.ry + par.x);
    cx = Math.cos(cam.rx + par.y);
    sx = Math.sin(cam.rx + par.y);
    const libreX = ancho - margen.izquierda - margen.derecha;
    const libreY = alto - margen.arriba - margen.abajo;
    // cuando un panel se abre o se cierra, el tejido se desliza a su nuevo centro en vez de saltar
    const q = base ? k * 0.55 : 1;
    base += (Math.min(libreX * 0.92, libreY * 1.25) * 0.45 - base) * q;
    centroX += (margen.izquierda + libreX / 2 - centroX) * q;
    centroY += (margen.arriba + libreY / 2 - centroY) * q;
    escala = base * cam.zoom;
  }
  function proyectar(p: number[]): number[] {
    const x = p[0] * cy + p[2] * sy, z0 = -p[0] * sy + p[2] * cy;
    const y = p[1] * cx - z0 * sx, z = p[1] * sx + z0 * cx;
    const f = 3 / (3 + z);
    return [centroX + x * f * escala, centroY + y * f * escala, z, f];
  }
  // de un movimiento en pantalla a un movimiento en el mundo, a la profundidad de la neurona que se jala
  function alMundo(dx: number, dy: number, f: number): V3 {
    const x1 = dx / (f * escala), y1 = dy / (f * escala);
    const y = y1 * cx, z0 = -y1 * sx;
    return [x1 * cy - z0 * sy, y, x1 * sy + z0 * cy];
  }
  // de un punto de la pantalla a su sitio en el mundo, a una profundidad dada
  function desdePantalla(x: number, y: number, z: number): V3 {
    const f = 3 / (3 + z), xv = (x - centroX) / (f * escala), yv = (y - centroY) / (f * escala);
    const z0 = -yv * sx + z * cx;
    return [xv * cy - z0 * sy, yv * cx + z * sx, xv * sy + z0 * cy];
  }
  // lo que mide un rótulo del abanico según el sitio que hay, y la zona donde el abanico cabe entero
  const anchoRotulo = () => limitar((ancho - margen.izquierda - margen.derecha) / 2 - 252, 120, 300);
  function zona(): number[] {
    const medio = 238 + anchoRotulo(), semi = ((filas - 1) / 2) * PASO;
    return [margen.izquierda + medio, ancho - margen.derecha - medio, margen.arriba + semi + 112, alto - margen.abajo - semi - 74];
  }
  const control = (a: number[], b: number[], k: number) => [(a[0] + b[0]) / 2 - (b[1] - a[1]) * k, (a[1] + b[1]) / 2 + (b[0] - a[0]) * k];

  // física: cada neurona vuelve a su sitio y cada fibra tira de sus dos extremos cuando se estira
  function fisica(dt: number) {
    const paso = Math.min(2, dt / 16.7);
    // las notas que salieron con la neurona sacada van a su puesto en el abanico, una tras otra
    let puestos: V3[] | undefined;
    const ahora = performance.now();
    if (desplegada >= 0) {
      const c = puntos[desplegada], f = proyectar(c.p)[3];
      puestos = abanico.map((a) => {
        const [dx, dy] = sitio(a), m = alMundo(dx, dy, f);
        return [c.p[0] + m[0], c.p[1] + m[1], c.p[2] + m[2]];
      });
    }
    const suelta = (i: number) => i !== jalada && i !== desplegada && !enAbanico.has(i);
    for (const [a, b, , largo] of fibras) {
      const A = puntos[a], B = puntos[b];
      const dx = B.p[0] - A.p[0], dy = B.p[1] - A.p[1], dz = B.p[2] - A.p[2];
      const d = Math.hypot(dx, dy, dz) || 1e-6;
      if (Math.abs(d - largo) < 0.0006) continue;
      // las fibras de la neurona que se jala tiran más: sus vecinas la siguen a la vista
      const tiron = ((d - largo) / d) * (a === jalada || b === jalada ? 0.13 : 0.045) * paso;
      const pa = 1 / Math.sqrt(1 + (vecinas.get(a)?.length ?? 0) * 0.5), pb = 1 / Math.sqrt(1 + (vecinas.get(b)?.length ?? 0) * 0.5);
      if (suelta(a)) { A.v[0] += dx * tiron * pa; A.v[1] += dy * tiron * pa; A.v[2] += dz * tiron * pa; }
      if (suelta(b)) { B.v[0] -= dx * tiron * pb; B.v[1] -= dy * tiron * pb; B.v[2] -= dz * tiron * pb; }
    }
    let energia = 0;
    puntos.forEach((d, i) => {
      if (i === jalada || i === desplegada) return;
      const n = enAbanico.get(i);
      if (puestos && n !== undefined && ahora >= (entro.get(i) ?? 0)) {
        // muelle vivo: llega, se pasa un poco y se asienta
        for (let k = 0; k < 3; k++) {
          d.v[k] = (d.v[k] + (puestos[n][k] - d.p[k]) * 0.1 * paso) * 0.76;
          d.p[k] += d.v[k] * paso;
        }
        return;
      }
      for (let k = 0; k < 3; k++) {
        d.v[k] = (d.v[k] + (d.a[k] - d.p[k]) * 0.02 * paso) * 0.86;
        d.p[k] += d.v[k] * paso;
        energia += Math.abs(d.v[k]) + Math.abs(d.a[k] - d.p[k]) * 0.05;
      }
    });
    if (energia < 0.0008 && jalada < 0 && desplegada < 0) despierto = 0;
  }

  function rotulo(i: number, texto: string, fuerte: boolean, puestos: number[][], alfa = 1) {
    const p = P[i];
    ctx.font = `${fuerte ? 600 : 500} 13px "Figtree Variable", sans-serif`;
    const w = ctx.measureText(texto).width + 22;
    const lado = p[0] + 18 + w > ancho - margen.derecha - 8 ? -1 : 1;
    const x = lado > 0 ? p[0] + 16 : p[0] - 16 - w;
    let y = p[1];
    for (let n = 0; n < 12 && puestos.some((q) => x < q[0] + q[2] + 8 && q[0] < x + w + 8 && Math.abs(q[1] - y) < 29); n++) y += 29;
    puestos.push([x, y, w]);
    ctx.globalAlpha = alfa;
    ctx.fillStyle = fuerte ? '#7CFFE1' : 'rgba(2,14,28,.84)';
    ctx.beginPath();
    ctx.roundRect(x, y - 13, w, 26, 13);
    ctx.fill();
    if (!fuerte) {
      ctx.strokeStyle = 'rgba(140,230,255,.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.fillStyle = fuerte ? '#021420' : '#E6FBFF';
    ctx.fillText(texto, x + 11, y + 0.5);
    ctx.globalAlpha = 1;
  }

  // saca una neurona: las notas que la citan salen a la izquierda y las que ella cita, a la derecha
  function desplegar(i: number) {
    const ahora = performance.now();
    viene = desplegada >= 0 && desplegada !== i ? desplegada : -1;
    // volver a una neurona por la que ya se pasó acorta el camino; cualquier otra lo alarga
    const ya = rastro.indexOf(i);
    rastro = ya >= 0 ? rastro.slice(0, ya + 1) : [...rastro, i];
    if (!enAbanico.has(i)) ondas.push({ p: [puntos[i].a[0], puntos[i].a[1], puntos[i].a[2]], t: ahora });
    desplegada = i;
    salio = ahora;
    const cita = salientes.get(i) ?? new Set<number>();
    const peso = (j: number) => puntos[j].grado + puntos[j].lecturas * 2;
    const region = (j: number) => ORDEN_TIPOS.indexOf(puntos[j].tipo);
    lados = [[], []];
    for (const j of vecinas.get(i) ?? []) lados[cita.has(j) ? 1 : 0].push(j);
    // juntas por región y, dentro de cada una, primero las más citadas y leídas
    for (const lista of lados) lista.sort((x, y) => region(x) - region(y) || peso(y) - peso(x));
    // la neurona de la que se viene queda a la vista
    desde = lados.map((lista) => limitar(lista.indexOf(viene) - 6, 0, Math.max(0, lista.length - POR_LADO)));
    armar(true);
    despierto = 1;
    oyentes.alJalar(puntos[i].id, lados[0].length, lados[1].length, rastro.map((j) => puntos[j].id));
  }
  // el abanico muestra una ventana de cada lista; con la rueda la ventana corre
  function armar(escalonado: boolean) {
    const ahora = performance.now(), antes = entro;
    abanico = [];
    lados.forEach((lista, n) => {
      const caben = lista.slice(desde[n], desde[n] + POR_LADO);
      ocultas[n] = lista.length - caben.length;
      caben.forEach((j, k) => abanico.push({ i: j, lado: n ? 1 : -1, k, m: caben.length, mutua: n === 1 && !!salientes.get(j)?.has(desplegada) }));
    });
    filas = Math.max(1, ...abanico.map((r) => r.m));
    enAbanico = new Map(abanico.map((r, n) => [r.i, n]));
    // salen del centro hacia los extremos, alternando lados; al correr la lista, las que ya estaban no vuelven a salir
    const turno = [...abanico].sort((x, y) => Math.abs(x.k - (x.m - 1) / 2) - Math.abs(y.k - (y.m - 1) / 2));
    entro = new Map(turno.map((r, n) => [r.i, escalonado ? ahora + n * 24 : (antes.get(r.i) ?? ahora)]));
  }
  function pasar(n: number, cuanto: number): boolean {
    const tope = lados[n].length - POR_LADO;
    if (tope <= 0) return false;
    const nuevo = limitar(desde[n] + cuanto, 0, tope);
    if (nuevo !== desde[n]) {
      desde[n] = nuevo;
      armar(false);
      despierto = 1;
    }
    return true;
  }
  // sacar sin arrastrar: la neurona se desliza al centro, o al lugar de la que estaba fuera (así se camina el tejido)
  function sacar(i: number) {
    if (i < 0 || i === desplegada) return;
    const c = desplegada >= 0 ? P[desplegada] : undefined;
    desplegar(i);
    destino = c ? [c[0], c[1]] : 'centro';
    sobre = -1;
    oyentes.alPasar(undefined, 0, 0);
  }
  function recoger() {
    if (desplegada < 0) return;
    ondas.push({ p: [puntos[desplegada].a[0], puntos[desplegada].a[1], puntos[desplegada].a[2]], t: performance.now() + 260 });
    desplegada = jalada = viene = -1;
    abanico = [];
    enAbanico = new Map();
    entro = new Map();
    lados = [[], []];
    rastro = [];
    cajas = [];
    destino = undefined;
    despierto = 1;
    if (elegida < 0) meta.zoom = Math.min(meta.zoom, 1);
    oyentes.alJalar(undefined, 0, 0, []);
  }
  function recentrar() {
    recoger();
    meta.zoom = 1;
    meta.rx = 0.2;
    meta.ry = cam.ry;
    meta.volando = true;
    for (const d of puntos) d.v = [0, 0, 0];
    despierto = 1;
  }
  // con el abanico abierto la tarjeta no sigue al cursor: se pone junto al nombre señalado, por fuera,
  // y si ahí no cabe, al otro lado, debajo o encima; así no tapa ningún nombre
  function tarjeta(i: number) {
    const r = lienzo.getBoundingClientRect(), c = P[desplegada], rama = abanico[enAbanico.get(i) ?? -1];
    const ALTA = 196, id = puntos[i].id;
    if (rama && cajas.length) {
      const izq = Math.min(...cajas.map((q) => q.x)) - 336, der = Math.max(...cajas.map((q) => q.x + q.w)) + 16;
      const cabeIzq = izq >= margen.izquierda + 8, cabeDer = der + 320 <= ancho - margen.derecha - 8;
      const x = rama.lado < 0 ? (cabeIzq ? izq : cabeDer ? der : undefined) : cabeDer ? der : cabeIzq ? izq : undefined;
      if (x !== undefined) return oyentes.alPasar(id, r.left + x, r.top + limitar(P[i][1] - 58, margen.arriba + 64, alto - margen.abajo - ALTA - 8), true);
    }
    if (rama) {
      // o en el hueco que deja la columna más corta, al otro lado
      const otro = -rama.lado, suyas = abanico.filter((a) => a.lado === otro).length;
      const x = otro < 0 ? c[0] - 520 : c[0] + 200, y = c[1] + (Math.max(1, suyas) - 1) * (PASO / 2) + 44;
      if (suyas < filas - 5 && x >= margen.izquierda + 8 && x + 320 <= ancho - margen.derecha - 8 && y + ALTA < alto - margen.abajo - 60) return oyentes.alPasar(id, r.left + x, r.top + y, true);
    }
    const semi = ((filas - 1) / 2) * PASO, debajo = c[1] + semi + 54, encima = c[1] - semi - 62 - ALTA;
    const y = debajo + ALTA < alto - margen.abajo - 56 ? debajo : encima > margen.arriba + 56 ? encima : alto - margen.abajo - ALTA - 8;
    oyentes.alPasar(id, r.left + c[0] - 160, r.top + y, true);
  }
  function flecha(x: number, y: number, doble: boolean) {
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 10, y);
    ctx.moveTo(x + 6.5, y - 3.5);
    ctx.lineTo(x + 10, y);
    ctx.lineTo(x + 6.5, y + 3.5);
    if (doble) {
      ctx.moveTo(x + 3.5, y - 3.5);
      ctx.lineTo(x, y);
      ctx.lineTo(x + 3.5, y + 3.5);
    }
    ctx.stroke();
  }
  function rotulosAbanico(ahora: number) {
    const c = P[desplegada], centro = puntos[desplegada];
    const abre = suave((ahora - salio) / 300);
    cajas = [];
    // su nombre, encima, y de qué clase es, debajo
    ctx.font = '600 14px "Figtree Variable", sans-serif';
    const letras = limitar(Math.floor((anchoRotulo() - 66) / 7.1), 12, 36);
    const titulo = recortar(centro.titulo, 32), w = ctx.measureText(titulo).width + 28;
    const sube = centro.r * c[3] * 0.62 + 24;
    ctx.globalAlpha = abre;
    ctx.shadowColor = 'rgba(124,255,225,.55)';
    ctx.shadowBlur = 22;
    ctx.fillStyle = '#7CFFE1';
    ctx.beginPath();
    ctx.roundRect(c[0] - w / 2, c[1] - sube - 30, w, 30, 15);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#021420';
    ctx.textAlign = 'center';
    ctx.fillText(titulo, c[0], c[1] - sube - 14.5);
    ctx.font = '600 10px "Figtree Variable", sans-serif';
    ctx.letterSpacing = '1.8px';
    ctx.fillStyle = COLOR_TIPO[centro.tipo];
    ctx.globalAlpha = abre * 0.85;
    ctx.fillText(SINGULAR_TIPO[centro.tipo].toUpperCase(), c[0] + 1, c[1] + sube + 4);
    ctx.letterSpacing = '0px';
    // cada nota con su nombre; la flecha dice hacia dónde va la cita y el número, con cuántas se comunica ella
    for (const a of abanico) {
      const sale = suave((ahora - (entro.get(a.i) ?? 0) - 140) / 300);
      if (sale <= 0) continue;
      const d = puntos[a.i], p = P[a.i], color = COLOR_TIPO[d.tipo], viva = a.i === sobre || a.i === elegida;
      ctx.font = `${viva ? 600 : 500} 13px "Figtree Variable", sans-serif`;
      const texto = recortar(d.titulo, letras), largo = ctx.measureText(texto).width;
      const cuantas = String(vecinas.get(a.i)?.length ?? 0);
      ctx.font = '500 11px "Figtree Variable", sans-serif';
      const ancho = largo + 51 + ctx.measureText(cuantas).width, hueco = d.r * p[3] * 0.5 + 10;
      const x = a.lado > 0 ? p[0] + hueco : p[0] - hueco - ancho;
      cajas.push({ i: a.i, x, y: p[1] - 13, w: ancho });
      ctx.globalAlpha = sale;
      ctx.fillStyle = viva ? color : 'rgba(2,14,28,.9)';
      ctx.beginPath();
      ctx.roundRect(x, p[1] - 13, ancho, 26, 13);
      ctx.fill();
      ctx.strokeStyle = `rgba(${rgb(color)},${viva ? 1 : 0.42})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.textAlign = 'left';
      const tx = a.lado > 0 ? x + 30 : x + 13;
      ctx.fillStyle = viva ? 'rgba(2,20,32,.7)' : 'rgba(230,251,255,.46)';
      ctx.fillText(cuantas, tx + largo + 8, p[1] + 1);
      ctx.font = `${viva ? 600 : 500} 13px "Figtree Variable", sans-serif`;
      ctx.fillStyle = viva ? '#021420' : '#E6FBFF';
      ctx.fillText(texto, tx, p[1] + 0.5);
      ctx.strokeStyle = viva ? '#021420' : color;
      flecha(a.lado > 0 ? x + 11 : x + ancho - 22, p[1], a.mutua);
      if (a.i === viene) {
        // de esta neurona se viene: un aro de puntos la señala
        ctx.strokeStyle = '#E6FBFF';
        ctx.globalAlpha = sale * 0.8;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([2, 4]);
        ctx.lineDashOffset = -ahora * 0.008;
        ctx.beginPath();
        ctx.arc(p[0], p[1], d.r * p[3] * 0.5 + 6, 0, 7);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // cabecera de cada lado
    ctx.globalAlpha = abre * 0.9;
    for (const lado of [-1, 1]) {
      const n = lado > 0 ? 1 : 0, m = abanico.filter((a) => a.lado === lado).length, total = lados[n].length;
      if (!m) continue;
      const x = c[0] + lado * 164;
      ctx.textAlign = lado > 0 ? 'left' : 'right';
      ctx.font = '600 10.5px "Figtree Variable", sans-serif';
      ctx.letterSpacing = '1.6px';
      ctx.fillStyle = 'rgba(230,251,255,.62)';
      ctx.fillText(lado > 0 ? `CITA A  ${total}` : `LA CITAN  ${total}`, x, c[1] - ((m - 1) / 2) * PASO - 34);
      ctx.letterSpacing = '0px';
      if (total > m) {
        ctx.font = '500 12px "Figtree Variable", sans-serif';
        ctx.fillStyle = 'rgba(230,251,255,.56)';
        ctx.fillText(`${desde[n] + 1} a ${desde[n] + m} de ${total}  ·  gira la rueda para ver las demás`, x, c[1] + ((m - 1) / 2) * PASO + 32);
      }
    }
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  function cuadro(ahora: number) {
    if (!vivo) return;
    requestAnimationFrame(cuadro);
    const dt = Math.min(50, ahora - previo);
    previo = ahora;
    if (document.hidden || !ancho) return;
    const k = 1 - Math.exp(-dt / 160);

    // cámara: inercia al soltar, vuelo suave al elegir, giro lento cuando nadie la toca
    if (!arrastre || arrastre.nodo >= 0) {
      if (meta.volando) {
        cam.ry += (meta.ry - cam.ry) * k * 0.9;
        cam.rx += (meta.rx - cam.rx) * k * 0.9;
        if (Math.abs(meta.ry - cam.ry) + Math.abs(meta.rx - cam.rx) < 0.002) meta.volando = false;
      } else {
        cam.ry += cam.vry;
        cam.rx = limitar(cam.rx + cam.vrx, -1.25, 1.25);
        cam.vry *= 0.93;
        cam.vrx *= 0.9;
      }
    }
    // el giro es muy lento (una vuelta cada cinco minutos) y arranca y frena sin tirones
    const quiereGirar = gira && !quieto && !arrastre && !meta.volando && elegida < 0 && desplegada < 0 && sobre < 0;
    velGiro += ((quiereGirar ? 0.000021 : 0) - velGiro) * k * 0.22;
    cam.ry += dt * velGiro;
    cam.zoom += (meta.zoom - cam.zoom) * k * 0.7;
    camara(k);
    if (jalada >= 0 && arrastre) {
      // la neurona va pegada al cursor aunque el tejido se mueva debajo
      // y al salir se acerca: crece un poco, como algo que se saca del agua
      arrastre.zv += (-0.3 - arrastre.zv) * k * 0.6;
      arrastre.ox *= 1 - k;
      arrastre.oy *= 1 - k;
      puntos[jalada].p = desdePantalla(arrastre.px + arrastre.ox, arrastre.py + arrastre.oy, arrastre.zv);
      puntos[jalada].v = [0, 0, 0];
    } else if (desplegada >= 0) {
      // suelta, se acomoda sola donde su abanico cabe entero, sin quedar bajo ningún panel;
      // si se sacó sin arrastrar, antes se desliza a su destino
      const c = proyectar(puntos[desplegada].p), [x0, x1, y0, y1] = zona();
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, a = destino === 'centro' ? [mx, my] : (destino ?? c);
      const qx = x0 > x1 ? mx : limitar(a[0], x0, x1), qy = y0 > y1 ? my : limitar(a[1], y0, y1);
      const falta = Math.abs(qx - c[0]) + Math.abs(qy - c[1]);
      if (falta < 1) destino = undefined;
      if (falta > 0.5 || Math.abs(c[2] + 0.3) > 0.004) puntos[desplegada].p = desdePantalla(c[0] + (qx - c[0]) * k * 0.8, c[1] + (qy - c[1]) * k * 0.8, c[2] + (-0.3 - c[2]) * k * 0.8);
    }
    if (despierto) fisica(dt);

    ctx.clearRect(0, 0, ancho, alto);
    P = puntos.map((d) => proyectar(d.p));
    const edad = ahora - nacio;
    const abierta = desplegada >= 0;
    const foco = abierta ? desplegada : elegida;
    const cerca = new Set<number>(foco >= 0 ? vecinas.get(foco) : sobre >= 0 ? vecinas.get(sobre) : []);
    const enfocando = foco >= 0 || resaltadas.size > 0;
    fibraLuz += ((abierta ? 0.13 : enfocando ? 0.3 : sobre >= 0 ? 0.6 : 1) - fibraLuz) * k;
    const zFoco = foco >= 0 ? P[foco][2] : -0.25;

    // la luz que le toca a cada neurona
    puntos.forEach((d, i) => {
      let quiere = d.base;
      if (abierta) quiere = i === foco ? 1.5 : enAbanico.has(i) ? (i === sobre || i === elegida ? 1.5 : 1.15) : cerca.has(i) ? 0.5 : 0.2;
      else if (resaltadas.size) quiere = resaltadas.has(i) ? 1.3 : 0.1;
      else if (foco >= 0) quiere = i === foco ? 1.5 : cerca.has(i) ? 1.05 : hilo.includes(i) ? 0.7 : 0.13;
      else if (sobre >= 0) quiere = i === sobre ? 1.4 : cerca.has(i) ? 1.05 : d.base * 0.5;
      else if (solo) quiere = d.tipo === solo ? d.base + 0.2 : 0.1;
      if (hilo.includes(i) && !resaltadas.size && !abierta) quiere = Math.max(quiere, 1.15);
      if (tocadas.has(i)) quiere = Math.max(quiere, 1.4);
      d.luz += (quiere - d.luz) * k;
      d.esc += ((i === jalada ? 1.9 : i === sobre ? 1.55 : i === foco ? 1.7 : abierta && enAbanico.has(i) ? 1.25 : 1) - d.esc) * k * 1.6;
    });

    ctx.globalCompositeOperation = 'lighter';

    // plancton lejano y la nube de cada región: dan volumen al agua
    for (const m of plancton) {
      m.p[1] -= m.v * dt;
      if (m.p[1] < -1.3) m.p[1] = 1.3;
      const p = proyectar(m.p);
      if (p[2] < 0.2) continue;
      const s = m.r * p[3] * 1.4;
      ctx.globalAlpha = (0.1 + 0.08 * Math.sin(ahora * 0.001 + m.f)) * suave(edad / 2400);
      ctx.drawImage(mota, p[0] - s, p[1] - s, s * 2, s * 2);
    }
    if (!resaltadas.size) {
      ORDEN_TIPOS.forEach((t, i) => {
        const p = proyectar(CENTRO[i]);
        const s = escala * 0.5 * p[3];
        ctx.globalAlpha = (solo && solo !== t ? 0.12 : 0.55) * fibraLuz * suave((edad - 400) / 2200);
        ctx.drawImage(nubes[i], p[0] - s, p[1] - s, s * 2, s * 2);
      });
    }

    // la órbita: un aro de puntos alrededor del tejido, que deja ver hacia dónde gira
    const aparece = suave((edad - 700) / 1900);
    if (aparece > 0.01 && fibraLuz > 0.2) {
      ctx.fillStyle = '#9FE8FF';
      for (let n = 0; n < 144; n++) {
        const a = (n / 144) * 6.2832, p = proyectar([Math.cos(a) * 1.34, 0, Math.sin(a) * 1.34]);
        const marca = n % 12 === 0;
        ctx.globalAlpha = aparece * (fibraLuz - 0.2) * (marca ? 0.85 : 0.36) * limitar(1.1 - (p[2] + 1.34) / 2.68, 0.16, 1);
        ctx.beginPath();
        ctx.arc(p[0], p[1], (marca ? 1.7 : 0.9) * p[3], 0, 7);
        ctx.fill();
      }
    }
    // fibras: todas, con el color de la región de donde salen
    ctx.lineWidth = 0.65;
    porColor.forEach((lista, t) => {
      if (!lista.length) return;
      ctx.globalAlpha = aparece * fibraLuz * (solo && ORDEN_TIPOS[t] !== solo ? 0.25 : 1);
      ctx.strokeStyle = `rgba(${rgb(COLOR_TIPO[ORDEN_TIPOS[t]])},.13)`;
      ctx.beginPath();
      for (const f of lista) {
        const [a, b, curva] = fibras[f];
        const c = control(P[a], P[b], curva);
        ctx.moveTo(P[a][0], P[a][1]);
        ctx.quadraticCurveTo(c[0], c[1], P[b][0], P[b][1]);
      }
      ctx.stroke();
    });
    // murmullo: chispas lentas que recorren unas pocas fibras aunque nadie esté leyendo
    if (!enfocando) {
      for (const f of ambiente) {
        const [a, b, curva] = fibras[f];
        const u = (ahora * 0.00007 + f * 0.3713) % 1;
        const c = control(P[a], P[b], curva), w = 1 - u;
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.55 * aparece;
        ctx.drawImage(chispa, w * w * P[a][0] + 2 * w * u * c[0] + u * u * P[b][0] - 3.5, w * w * P[a][1] + 2 * w * u * c[1] + u * u * P[b][1] - 3.5, 7, 7);
      }
    }

    // fibras encendidas: de la neurona enfocada, de la que se señala, del hilo y de lo que acaba de leer un agente
    for (const [i, cuando] of tocadas) if (ahora - cuando > IMPULSO_MS) tocadas.delete(i);
    const focos = new Set<number>(foco >= 0 ? tocadas.keys() : [...hilo, ...tocadas.keys()]);
    if (abierta) focos.clear();
    else if (foco >= 0) focos.add(foco);
    else if (sobre >= 0) focos.add(sobre);
    for (const i of focos) {
      const principal = i === foco || (foco < 0 && i === sobre);
      const lista = (vecinas.get(i) ?? []).slice(0, principal ? 90 : 12);
      for (const j of lista) {
        const curva = (((i * 31 + j * 17) % 100) / 100 - 0.5) * 0.3;
        const c = control(P[i], P[j], curva);
        const g = ctx.createLinearGradient(P[i][0], P[i][1], P[j][0], P[j][1]);
        g.addColorStop(0, principal ? 'rgba(230,251,255,.9)' : 'rgba(160,240,255,.4)');
        g.addColorStop(1, `rgba(${rgb(COLOR_TIPO[puntos[j].tipo])},${principal ? 0.55 : 0.2})`);
        ctx.globalAlpha = principal ? Math.min(1, puntos[i].luz) : 0.55;
        ctx.strokeStyle = g;
        ctx.lineWidth = principal ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(P[i][0], P[i][1]);
        ctx.quadraticCurveTo(c[0], c[1], P[j][0], P[j][1]);
        ctx.stroke();
        // el impulso viaja desde la neurona hacia cada una con la que se comunica
        const u = (ahora * 0.00026 * (1 + Math.abs(curva) * 3) + (i * 7 + j * 13) * 0.137) % 1, w = 1 - u, s = principal ? 6.5 : 5;
        ctx.globalAlpha = Math.sin(u * Math.PI);
        ctx.drawImage(chispa, w * w * P[i][0] + 2 * w * u * c[0] + u * u * P[j][0] - s, w * w * P[i][1] + 2 * w * u * c[1] + u * u * P[j][1] - s, s * 2, s * 2);
      }
    }
    // el hilo del pensamiento, de nota en nota, con la luz corriendo por él
    if (hilo.length > 1) {
      ctx.globalAlpha = abierta ? 0.1 : resaltadas.size ? 0.25 : 1;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#19C3FF';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = 'rgba(124,255,225,.42)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      hilo.forEach((i, n) => {
        if (!n) return ctx.moveTo(P[i][0], P[i][1]);
        const c = control(P[hilo[n - 1]], P[i], n % 2 ? 0.16 : -0.16);
        ctx.quadraticCurveTo(c[0], c[1], P[i][0], P[i][1]);
      });
      ctx.stroke();
      ctx.strokeStyle = '#E6FBFF';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([14, 90]);
      ctx.lineDashOffset = -ahora * 0.06;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    // neuronas, de la más lejana a la más cercana; lo que cae fuera del plano de enfoque se ve borroso
    const orden = puntos.map((_, i) => i).sort((a, b) => P[b][2] - P[a][2]);
    const pintar = (i: number) => {
      const d = puntos[i], p = P[i];
      const nace = (edad - d.retraso) / 760;
      if (nace <= 0) return;
      const lejos = Math.abs(p[2] - zFoco);
      const nivel = abierta ? (i === desplegada || enAbanico.has(i) ? 0 : 2) : d.luz > 1 ? 0 : lejos < 0.42 ? 0 : lejos < 0.9 ? 1 : 2;
      const late = 1 + 0.07 * Math.sin(ahora * 0.0016 + d.fase) + (d.luz > 1.1 ? 0.12 * Math.sin(ahora * 0.005 + d.fase) : 0);
      const s = d.r * p[3] * Math.sqrt(cam.zoom) * d.esc * late * rebote(nace) * (nivel === 2 ? 1.3 : nivel === 1 ? 1.14 : 1) * 1.7;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, d.luz * (0.3 + 0.8 * p[3] * p[3]) * suave(nace));
      ctx.drawImage(sellos[ORDEN_TIPOS.indexOf(d.tipo)][nivel], p[0] - s, p[1] - s, s * 2, s * 2);
      // destello: una raya de luz en lo que está encendido y, más tenue, en las neuronas más citadas
      const faro = abierta ? (i === desplegada ? 0.55 : 0) : d.luz > 1.1 ? 0.5 : nivel === 0 && d.grado >= umbralFaro ? 0.2 : 0;
      if (faro) {
        const w = s * 2.3;
        ctx.globalAlpha = faro * Math.min(1, d.luz) * suave(nace) * (0.8 + 0.2 * Math.sin(ahora * 0.0021 + d.fase));
        ctx.drawImage(raya, p[0] - w, p[1] - s * 0.085, w * 2, s * 0.17);
      }
      if ((d.reciente || d.revisar) && d.luz > 0.3) {
        // sin revisar: anillo de puntos que gira; cita algo que ya no existe: anillo ámbar
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.9 * Math.min(1, d.luz) * suave(nace);
        if (d.reciente) {
          ctx.strokeStyle = '#E6FBFF';
          ctx.lineWidth = 1.3;
          ctx.setLineDash([2, 4]);
          ctx.lineDashOffset = -ahora * 0.006;
          ctx.beginPath();
          ctx.arc(p[0], p[1], s * 0.3 + 4.5, 0, 7);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const giro = ahora * 0.0011 + d.fase, radio = s * 0.3 + 3.5;
          ctx.fillStyle = '#FFC46B';
          ctx.beginPath();
          ctx.arc(p[0] + Math.cos(giro) * radio, p[1] + Math.sin(giro) * radio * 0.8, 1.7, 0, 7);
          ctx.fill();
        }
      }
    };
    for (const i of orden) if (!abierta || (i !== desplegada && !enAbanico.has(i))) pintar(i);
    // plancton cercano: desenfocado, pasa por delante
    ctx.globalCompositeOperation = 'lighter';
    for (const m of plancton) {
      const p = proyectar(m.p);
      if (p[2] >= 0.2 || p[2] < -2.2) continue;
      const s = m.r * p[3] * 3.2;
      ctx.globalAlpha = (0.07 + 0.05 * Math.sin(ahora * 0.001 + m.f)) * suave(edad / 2400);
      ctx.drawImage(mota, p[0] - s, p[1] - s, s * 2, s * 2);
    }

    // la neurona sacada: el resto se hunde en la penumbra y sus fibras se abren hacia cada nota
    veloLuz += ((abierta ? 1 : 0) - veloLuz) * k * 1.5;
    if (abierta) veloEn = [P[desplegada][0], P[desplegada][1]];
    if (veloLuz > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = veloLuz;
      const g = ctx.createRadialGradient(veloEn[0], veloEn[1], 0, veloEn[0], veloEn[1], 520);
      g.addColorStop(0, 'rgba(1,7,16,.66)');
      g.addColorStop(0.6, 'rgba(1,7,16,.4)');
      g.addColorStop(1, 'rgba(1,7,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(veloEn[0] - 520, veloEn[1] - 520, 1040, 1040);
    }
    if (abierta) {
      const c = P[desplegada];
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const a of abanico) {
        const n = enAbanico.get(a.i) ?? 0;
        const sale = suave((ahora - (entro.get(a.i) ?? 0)) / 360);
        if (sale <= 0) continue;
        const p = P[a.i], mx = c[0] + (p[0] - c[0]) * 0.5, viva = a.i === sobre || a.i === elegida;
        const g = ctx.createLinearGradient(c[0], c[1], p[0], p[1]);
        g.addColorStop(0, 'rgba(230,251,255,.9)');
        g.addColorStop(1, `rgba(${rgb(COLOR_TIPO[puntos[a.i].tipo])},${viva ? 1 : 0.62})`);
        ctx.globalAlpha = sale;
        ctx.strokeStyle = g;
        ctx.lineWidth = viva ? 2.4 : 1.3;
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.bezierCurveTo(mx, c[1], mx, p[1], p[0], p[1]);
        ctx.stroke();
        // el impulso viaja en el sentido de la cita: de quien cita hacia lo citado
        let u = (ahora * 0.0004 + n * 0.173) % 1;
        if (a.lado < 0) u = 1 - u;
        const w = 1 - u, s = viva ? 8 : 6;
        const bx = w * w * w * c[0] + 3 * w * u * mx + u * u * u * p[0];
        const by = w * w * (w + 3 * u) * c[1] + u * u * (3 * w + u) * p[1];
        ctx.globalAlpha = Math.sin(u * Math.PI) * sale;
        ctx.drawImage(chispa, bx - s, by - s, s * 2, s * 2);
      }
      for (const i of orden) if (i === desplegada || enAbanico.has(i)) pintar(i);
    }

    // resplandor: la luz del tejido se derrama un poco en el agua
    ctx.globalCompositeOperation = 'source-over';
    gBrillo.globalCompositeOperation = 'copy';
    gBrillo.drawImage(lienzo, 0, 0, brillo.width, brillo.height);
    gBrillo2.clearRect(0, 0, brillo2.width, brillo2.height);
    gBrillo2.filter = 'blur(6px)';
    gBrillo2.drawImage(brillo, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.3;
    ctx.drawImage(brillo2, 0, 0, ancho, alto);

    // onda de cada lectura recién llegada
    for (const [i, cuando] of tocadas) {
      for (const desfase of [0, 420]) {
        const u = (ahora - cuando - desfase) / 1900;
        if (u < 0 || u > 1) continue;
        ctx.globalAlpha = (1 - u) * 0.9;
        ctx.strokeStyle = '#7CFFE1';
        ctx.lineWidth = 2 * (1 - u) + 0.4;
        ctx.beginPath();
        ctx.arc(P[i][0], P[i][1], 8 + suave(u) * 64, 0, 7);
        ctx.stroke();
      }
    }
    // onda donde una neurona sale del tejido o vuelve a él
    for (let n = ondas.length - 1; n >= 0; n--) {
      const u = (ahora - ondas[n].t) / 1100;
      if (u > 1) ondas.splice(n, 1);
      if (u < 0 || u > 1) continue;
      const p = proyectar(ondas[n].p);
      ctx.globalAlpha = (1 - u) * 0.75;
      ctx.strokeStyle = '#E6FBFF';
      ctx.lineWidth = 1.8 * (1 - u) + 0.3;
      ctx.beginPath();
      ctx.arc(p[0], p[1], 6 + suave(u) * 52, 0, 7);
      ctx.stroke();
    }
    // anillo de la neurona enfocada
    ctx.globalCompositeOperation = 'source-over';
    if (foco >= 0) {
      const p = P[foco], r = puntos[foco].r * p[3] * 0.62 + 11 + Math.sin(ahora * 0.004) * 1.5;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#E6FBFF';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      ctx.setLineDash([3, 7]);
      ctx.lineDashOffset = ahora * 0.01;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r + 8, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // rótulos
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    const puestos: number[][] = [];
    // el nombre de cada región, en su borde, mientras nada pide la atención
    const luzRegion = abierta ? 0 : limitar((fibraLuz - 0.4) / 0.6, 0, 1) * suave((edad - 2200) / 1600);
    if (luzRegion > 0.02) {
      ctx.textAlign = 'center';
      const sitios = regiones.map((g) => {
        const p = proyectar(g.c);
        let dx = p[0] - centroX, dy = p[1] - centroY;
        const largo = Math.hypot(dx, dy);
        if (largo < 30) { dx = 0; dy = -1; } else { dx /= largo; dy /= largo; }
        const lejos = g.r * escala * p[3] * 1.2 + 30;
        return { g, f: p[3], x: limitar(p[0] + dx * lejos, margen.izquierda + 96, ancho - margen.derecha - 48), y: limitar(p[1] + dy * lejos * 0.85, margen.arriba + 36, alto - margen.abajo - 92) };
      });
      // dos nombres que se pisan se apartan uno del otro, poco a poco (sin saltos mientras el tejido gira)
      for (let a = 0; a < sitios.length; a++) {
        for (let b = a + 1; b < sitios.length; b++) {
          const A = sitios[a], B = sitios[b];
          const enX = 1 - Math.abs(A.x - B.x) / 120, enY = 42 - Math.abs(A.y - B.y);
          if (enX <= 0 || enY <= 0) continue;
          const e = Math.min(1, enX * 2) * enY * 0.5 * (A.y <= B.y ? 1 : -1);
          A.y -= e;
          B.y += e;
        }
      }
      ctx.shadowColor = 'rgba(1,8,18,.95)';
      ctx.shadowBlur = 12;
      for (const { g, f, x, y } of sitios) {
        ctx.globalAlpha = luzRegion * (solo && solo !== g.t ? 0.18 : 0.92) * limitar(f * f, 0.45, 1);
        ctx.font = '600 10.5px "Figtree Variable", sans-serif';
        ctx.letterSpacing = '2.2px';
        ctx.fillStyle = COLOR_TIPO[g.t];
        ctx.fillText(ETIQUETA_TIPO[g.t].toUpperCase(), x, y);
        ctx.letterSpacing = '0px';
        ctx.font = '300 15px "Outfit Variable", sans-serif';
        ctx.fillStyle = 'rgba(230,251,255,.78)';
        ctx.fillText(String(g.n), x, y + 17);
      }
      ctx.shadowBlur = 0;
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    if (abierta) {
      // de dónde salió: un hilo fino hasta su sitio en el tejido
      const casa = proyectar(puntos[desplegada].a), c = P[desplegada];
      if (Math.hypot(casa[0] - c[0], casa[1] - c[1]) > 40) {
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = 'rgba(230,251,255,.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        ctx.moveTo(casa[0], casa[1]);
        ctx.lineTo(c[0], c[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(casa[0], casa[1], 5, 0, 7);
        ctx.stroke();
      }
      rotulosAbanico(ahora);
    } else if (foco >= 0) rotulo(foco, puntos[foco].titulo, true, puestos);
    if (abierta) {
      // ya están todos puestos
    } else if (resaltadas.size) {
      [...resaltadas].slice(0, 8).forEach((i) => rotulo(i, puntos[i].titulo, false, puestos));
    } else if (foco >= 0) {
      // las notas con las que se comunica, las más cercanas a la cámara primero
      [...cerca].sort((a, b) => P[a][2] - P[b][2]).slice(0, 9).forEach((i) => rotulo(i, puntos[i].titulo, false, puestos, Math.min(1, puntos[i].luz)));
    } else {
      const ultimo = hilo[hilo.length - 1];
      if (ultimo !== undefined) rotulo(ultimo, `${hilo.length}  ${puntos[ultimo].titulo}`, true, puestos);
      hilo.slice(0, -1).forEach((i, n) => rotulo(i, `${n + 1}  ${puntos[i].titulo}`, false, puestos));
      // al señalar una neurona se nombran las que se comunican con ella (su propio nombre va en la tarjeta del cursor)
      if (sobre >= 0) {
        const ya = new Set(hilo);
        (vecinas.get(sobre) ?? []).filter((i) => !ya.has(i)).sort((a, b) => P[a][2] - P[b][2]).slice(0, 6).forEach((i) => rotulo(i, puntos[i].titulo, false, puestos, Math.min(1, puntos[i].luz)));
      }
    }
    ctx.textBaseline = 'alphabetic';
  }
  requestAnimationFrame(cuadro);

  function masCercana(x: number, y: number): number {
    // con una neurona fuera, el nombre de cada nota vale tanto como su punto de luz
    if (desplegada >= 0) for (const c of cajas) if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + 26) return c.i;
    let mejor = -1;
    let dist = 20 * 20;
    P.forEach((p, i) => {
      if (puntos[i].luz < 0.25) return;
      const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] + 1) * 30;
      if (d < dist) {
        dist = d;
        mejor = i;
      }
    });
    return mejor;
  }
  const local = (e: MouseEvent) => {
    const r = lienzo.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  let toque = { i: -1, t: 0 };
  const alBajar = (e: PointerEvent) => {
    const [x, y] = local(e);
    const nodo = masCercana(x, y);
    arrastre = { x: e.clientX, y: e.clientY, ry: cam.ry, rx: cam.rx, movio: false, nodo, z: nodo >= 0 ? P[nodo][3] : 1, px: x, py: y, ox: nodo >= 0 ? P[nodo][0] - x : 0, oy: nodo >= 0 ? P[nodo][1] - y : 0, zv: nodo >= 0 ? P[nodo][2] : 0 };
    meta.volando = false;
    cam.vry = cam.vrx = 0;
    lienzo.setPointerCapture(e.pointerId);
  };
  const alMover = (e: PointerEvent) => {
    if (arrastre) {
      const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
      if (!arrastre.movio && Math.abs(dx) + Math.abs(dy) > 4) {
        arrastre.movio = true;
        if (arrastre.nodo >= 0) {
          jalada = arrastre.nodo;
          lienzo.style.cursor = 'grabbing';
          oyentes.alPasar(undefined, 0, 0);
          sobre = -1;
          destino = undefined;
          // jalar otra neurona recoge la anterior y saca esta
          if (desplegada !== jalada) desplegar(jalada);
        }
      }
      if (!arrastre.movio) return;
      if (arrastre.nodo >= 0) {
        // la neurona sigue al cursor (se coloca en cada cuadro); sus fibras hacen el resto
        [arrastre.px, arrastre.py] = local(e);
      } else {
        const antes = cam.ry;
        cam.ry = arrastre.ry + dx * 0.006;
        cam.vry = (cam.ry - antes) * 0.6 + cam.vry * 0.4;
        const rxAntes = cam.rx;
        cam.rx = limitar(arrastre.rx + dy * 0.005, -1.25, 1.25);
        cam.vrx = (cam.rx - rxAntes) * 0.5;
      }
      return;
    }
    const [x, y] = local(e);
    if (!quieto) {
      par.tx = (x / ancho - 0.5) * 0.1;
      par.ty = (y / alto - 0.5) * -0.06;
    }
    const i = masCercana(x, y);
    if (i !== sobre) {
      sobre = i;
      lienzo.style.cursor = i >= 0 ? 'pointer' : 'grab';
    }
    if (desplegada >= 0 && i >= 0) tarjeta(i);
    else oyentes.alPasar(i >= 0 ? puntos[i].id : undefined, e.clientX, e.clientY);
  };
  const alSubir = (e: PointerEvent) => {
    const fue = arrastre;
    arrastre = undefined;
    if (!fue) return;
    if (jalada >= 0) {
      // se queda donde la sueltas, con sus notas abiertas, hasta que la recojas
      jalada = -1;
      lienzo.style.cursor = 'grab';
      return;
    }
    if (fue.movio) return;
    // doble clic: sobre una neurona la saca del tejido; sobre el fondo vuelve a la vista completa.
    // Se recuerda dónde cayó el primer clic, porque entre uno y otro el tejido ya se está moviendo.
    const ahora = performance.now();
    if (ahora - toque.t < 420) {
      const cual = toque.i;
      toque = { i: -1, t: 0 };
      return cual >= 0 ? sacar(cual) : recentrar();
    }
    const [x, y] = local(e);
    const i = masCercana(x, y);
    toque = { i, t: ahora };
    if (i < 0) recoger();
    oyentes.alElegir(i >= 0 ? puntos[i].id : undefined);
  };
  const alSalir = () => {
    if (arrastre) return;
    sobre = -1;
    oyentes.alPasar(undefined, 0, 0);
  };
  const alRodar = (e: WheelEvent) => {
    e.preventDefault();
    // con una neurona fuera, la rueda corre la lista del lado donde está el cursor si no cabe entera
    if (desplegada >= 0 && !arrastre) {
      const n = local(e)[0] > P[desplegada][0] ? 1 : 0;
      if (lados[n].length > POR_LADO) {
        rueda += e.deltaY;
        const pasos = Math.trunc(rueda / 50);
        rueda -= pasos * 50;
        if (pasos) pasar(n, pasos);
        return;
      }
    }
    meta.zoom = limitar(meta.zoom * (e.deltaY < 0 ? 1.12 : 0.89), 0.55, 3.2);
  };
  lienzo.addEventListener('pointerdown', alBajar);
  lienzo.addEventListener('pointermove', alMover);
  lienzo.addEventListener('pointerup', alSubir);
  lienzo.addEventListener('pointercancel', alSubir);
  lienzo.addEventListener('pointerleave', alSalir);
  lienzo.addEventListener('wheel', alRodar, { passive: false });

  const varios = (ids: string[]) => ids.map((id) => indice.get(id)).filter((i): i is number => i !== undefined);
  // la cámara gira hasta dejar la neurona de frente, por el camino más corto
  function volarA(i: number) {
    const [x, y, z] = puntos[i].a;
    let ry = Math.atan2(x, -z);
    ry += Math.round((cam.ry - ry) / (2 * Math.PI)) * 2 * Math.PI;
    meta.ry = ry;
    meta.rx = limitar(Math.atan2(y, Math.hypot(x, z)) * -0.8, -1, 1);
    meta.volando = true;
    cam.vry = cam.vrx = 0;
  }

  return {
    datos(neuronas, pares) {
      const id = elegida >= 0 ? puntos[elegida]?.id : undefined;
      const delHilo = hilo.map((i) => puntos[i]?.id);
      const otra = puntos.length === 0 || !neuronas.some((n) => indice.has(n.id));
      const previos = new Map(puntos.map((d) => [d.id, d]));
      puntos = situar(neuronas, pares);
      if (otra) {
        // un cerebro distinto: nace desde el centro
        nacio = performance.now();
        cam.zoom = 0.62;
      } else {
        // el mismo, con cambios: lo que ya estaba conserva su luz y no vuelve a nacer
        for (const d of puntos) {
          const antes = previos.get(d.id);
          d.retraso = antes ? -1e6 : performance.now() - nacio;
          if (antes) d.luz = antes.luz;
        }
      }
      indice = new Map(puntos.map((d, i) => [d.id, i]));
      vecinas = new Map();
      const todas: [number, number, number, number][] = [];
      const vistas = new Set<string>();
      for (const [a, b] of pares) {
        const i = indice.get(a), j = indice.get(b);
        if (i === undefined || j === undefined || i === j) continue;
        const clave = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (vistas.has(clave)) continue;
        vistas.add(clave);
        const A = puntos[i].a, B = puntos[j].a;
        todas.push([i, j, (azarDe(a + b)() - 0.5) * 0.42, Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])]);
        vecinas.set(i, [...(vecinas.get(i) ?? []), j]);
        vecinas.set(j, [...(vecinas.get(j) ?? []), i]);
      }
      // un cerebro enorme no pinta todas sus fibras: se queda con una muestra pareja
      const paso = Math.max(1, Math.ceil(todas.length / FIBRAS_MAXIMAS));
      fibras = todas.filter((_, n) => n % paso === 0);
      porColor = ORDEN_TIPOS.map(() => []);
      fibras.forEach((f, n) => porColor[ORDEN_TIPOS.indexOf(puntos[f[0]].tipo)].push(n));
      ambiente = fibras.map((_, n) => n).filter((n) => n % Math.max(1, Math.floor(fibras.length / 46)) === 0);
      elegida = id ? (indice.get(id) ?? -1) : -1;
      hilo = varios(delHilo.filter((x): x is string => !!x));
      resaltadas = new Set();
      tocadas.clear();
      sobre = jalada = -1;
      if (desplegada >= 0) oyentes.alJalar(undefined, 0, 0, []);
      desplegada = viene = -1;
      abanico = [];
      enAbanico = new Map();
      entro = new Map();
      lados = [[], []];
      rastro = [];
      cajas = [];
      destino = undefined;
      // faros: el cinco por ciento más citado
      const grados = puntos.map((d) => d.grado).sort((x, y) => x - y);
      umbralFaro = Math.max(5, grados[Math.floor(grados.length * 0.95)] ?? Infinity);
      salientes = new Map();
      for (const [a, b] of pares) {
        const i = indice.get(a), j = indice.get(b);
        if (i !== undefined && j !== undefined && i !== j) salientes.set(i, (salientes.get(i) ?? new Set<number>()).add(j));
      }
      regiones = [];
      ORDEN_TIPOS.forEach((t) => {
        const suyas = puntos.filter((d) => d.tipo === t);
        if (suyas.length < 2) return;
        const c: V3 = [0, 0, 0];
        for (const d of suyas) for (let k = 0; k < 3; k++) c[k] += d.a[k] / suyas.length;
        const r = Math.sqrt(suyas.reduce((n, d) => n + (d.a[0] - c[0]) ** 2 + (d.a[1] - c[1]) ** 2 + (d.a[2] - c[2]) ** 2, 0) / suyas.length);
        regiones.push({ t, c, r, n: suyas.length });
      });
    },
    elegir(id) {
      elegida = id ? (indice.get(id) ?? -1) : -1;
      // una nota del abanico se abre sin mover nada; cualquier otra recoge lo desplegado
      if (desplegada >= 0 && (elegida < 0 || elegida === desplegada || enAbanico.has(elegida))) return;
      recoger();
      if (elegida >= 0) {
        volarA(elegida);
        meta.zoom = Math.max(meta.zoom, 1.32);
      } else meta.zoom = Math.min(meta.zoom, 1);
    },
    hilo(ids) {
      hilo = [...new Set(varios(ids))];
    },
    pulso(ids) {
      const ahora = performance.now();
      for (const i of varios(ids)) tocadas.set(i, ahora);
    },
    soloTipo(tipo) {
      solo = tipo;
    },
    resaltar(ids) {
      resaltadas = new Set(varios(ids));
    },
    girar(v) {
      gira = v;
    },
    margenes(m) {
      margen = m;
    },
    recoger,
    recentrar,
    sacar(id) {
      sacar(indice.get(id) ?? -1);
    },
    tecla(tecla) {
      if (desplegada < 0 || arrastre) return false;
      if (tecla === 'Backspace') {
        if (rastro.length < 2) return false;
        sacar(rastro[rastro.length - 2]);
        return true;
      }
      const actual = abanico.find((a) => a.i === sobre);
      if (tecla === 'Enter') {
        if (!actual) return false;
        sacar(actual.i);
        return true;
      }
      const paso = tecla === 'ArrowUp' ? -1 : tecla === 'ArrowDown' ? 1 : 0, lado = tecla === 'ArrowLeft' ? -1 : tecla === 'ArrowRight' ? 1 : 0;
      if ((!paso && !lado) || !abanico.length) return false;
      const deLado = (l: number) => abanico.filter((a) => a.lado === l).sort((a, b) => a.k - b.k);
      let sig: Rama | undefined;
      if (!actual) {
        const lista = deLado(lado || 1).length ? deLado(lado || 1) : deLado(-(lado || 1));
        sig = lista[paso < 0 ? lista.length - 1 : paso > 0 ? 0 : Math.floor((lista.length - 1) / 2)];
      } else if (lado) {
        const lista = deLado(lado);
        if (lado !== actual.lado && lista.length) sig = lista[limitar(Math.round(((actual.k + 0.5) / actual.m) * lista.length - 0.5), 0, lista.length - 1)];
      } else {
        const k = actual.k + paso, n = actual.lado > 0 ? 1 : 0;
        if (k >= 0 && k < actual.m) sig = deLado(actual.lado)[k];
        else {
          // en el borde, la lista corre si quedan notas por ver
          const antes = desde[n];
          pasar(n, paso);
          if (desde[n] !== antes) sig = deLado(actual.lado)[actual.k];
        }
      }
      if (sig) {
        sobre = sig.i;
        tarjeta(sig.i);
      }
      return true;
    },
    destruir() {
      vivo = false;
      observador.disconnect();
      lienzo.removeEventListener('pointerdown', alBajar);
      lienzo.removeEventListener('pointermove', alMover);
      lienzo.removeEventListener('pointerup', alSubir);
      lienzo.removeEventListener('pointercancel', alSubir);
      lienzo.removeEventListener('pointerleave', alSalir);
      lienzo.removeEventListener('wheel', alRodar);
    },
  };
}
