import type { Tipo } from '../../../core/src/tipos.ts';
import type { GrafoApi } from '../lib/api.ts';
import { diasDesde } from '../lib/tiempo.ts';
import { COLOR_TIPO, ETIQUETA_TIPO } from '../lib/tipos.ts';

export interface Nodo {
  id: string;
  tipo: Tipo;
  titulo: string;
  descripcion: string;
  hub: boolean;
  radio: number;
  color: string;
  // olvido: lo que nadie toca hace meses se apaga, nunca desaparece
  vigor: number;
  reciente: boolean;
  obsoleta: boolean;
  lecturas: number;
  grado: number;
  importancia: number;
  /** subgrupo dentro de su constelación (su tema): dirección unitaria desde el ancla del tipo */
  sub?: [number, number, number];
  /** nombre del tema (solo en constelaciones grandes): rotulo del subgrupo */
  tema?: string;
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  fx?: number;
  fy?: number;
  fz?: number;
}

export interface Enlace {
  source: string | Nodo;
  target: string | Nodo;
  clase: 'enlace' | 'hub';
}

export const idDe = (extremo: string | Nodo): string => (typeof extremo === 'string' ? extremo : extremo.id);

/**
 * Vocabulario de temas de las constelaciones grandes: la primera etiqueta de la nota que esté aquí es su tema
 * (`cerebro etiquetar` la pone). Un tipo con MIN_NOTAS_SUBGRUPOS o más notas reparte sus temas en una esfera
 * alrededor de su ancla; las notas sin tema se quedan en el centro del tipo.
 */
export const TEMAS = ['trabajo', 'interfaz', 'plataformas', 'seguridad', 'codigo', 'publicacion', 'comunicacion'] as const;
export const MIN_NOTAS_SUBGRUPOS = 15;

export function subgruposPorTema(
  notas: { id: string; tipo: string; tags: string[] }[],
): Map<string, { dir: [number, number, number]; tema: string }> {
  const resultado = new Map<string, { dir: [number, number, number]; tema: string }>();
  const porTipo = new Map<string, typeof notas>();
  for (const n of notas) porTipo.set(n.tipo, [...(porTipo.get(n.tipo) ?? []), n]);
  for (const grupo of porTipo.values()) {
    if (grupo.length < MIN_NOTAS_SUBGRUPOS) continue;
    const temaDe = (n: { tags: string[] }) => n.tags.find((t) => (TEMAS as readonly string[]).includes(t));
    const usados = TEMAS.filter((t) => grupo.some((n) => temaDe(n) === t));
    if (usados.length < 2) continue;
    const direccion = new Map(
      usados.map((t, i): [string, [number, number, number]] => {
        const y = 1 - (2 * (i + 0.5)) / usados.length;
        const r = Math.sqrt(1 - y * y);
        const ang = i * Math.PI * (3 - Math.sqrt(5));
        return [t, [Math.cos(ang) * r, y, Math.sin(ang) * r]];
      }),
    );
    for (const n of grupo) {
      const tema = temaDe(n) ?? '';
      const dir = direccion.get(tema);
      if (dir) resultado.set(n.id, { dir, tema });
    }
  }
  return resultado;
}

export function construirModelo(datos: GrafoApi, conObsoletas: boolean, previo?: Map<string, Nodo>): { nodos: Nodo[]; enlaces: Enlace[] } {
  const visibles = datos.nodos.filter((n) => conObsoletas || n.estado !== 'obsoleta');
  const ids = new Set(visibles.map((n) => n.id));
  const aristas = datos.aristas.filter((a) => ids.has(a.origen) && (a.clase === 'hub' || ids.has(a.destino)));

  const grado = new Map<string, number>();
  for (const a of aristas) {
    grado.set(a.origen, (grado.get(a.origen) ?? 0) + 1);
    grado.set(a.destino, (grado.get(a.destino) ?? 0) + 1);
  }

  const ahora = Date.now();
  const subgrupos = subgruposPorTema(visibles);
  const nodos: Nodo[] = visibles.map((n) => {
    const g = grado.get(n.id) ?? 0;
    const ultimo = Math.min(diasDesde(n.actualizado, ahora), n.ultimaLectura ? diasDesde(n.ultimaLectura, ahora) : Infinity);
    // refuerzo: crece con lo que lo enlaza y con lo que lo leen los agentes
    const radio = 2.2 + 0.7 * Math.sqrt(g) + 1.0 * Math.log2(1 + n.lecturas);
    return {
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      descripcion: n.descripcion,
      hub: false,
      radio,
      color: n.estado === 'obsoleta' ? '#B8C2CF' : COLOR_TIPO[n.tipo],
      vigor: n.estado === 'obsoleta' ? 0.3 : Math.min(1, Math.max(0.4, 1 - (ultimo - 21) / 160)),
      reciente: n.estado === 'reciente',
      obsoleta: n.estado === 'obsoleta',
      lecturas: n.lecturas,
      grado: g,
      importancia: g + 2 * n.lecturas,
      sub: subgrupos.get(n.id)?.dir,
      tema: subgrupos.get(n.id)?.tema,
    };
  });

  const hubs = new Set(aristas.filter((a) => a.clase === 'hub').map((a) => a.destino));
  for (const h of hubs) {
    const tipo = h.slice(4) as Tipo;
    nodos.push({
      id: h,
      tipo,
      titulo: ETIQUETA_TIPO[tipo] ?? tipo,
      descripcion: '',
      hub: true,
      radio: 1.6,
      color: COLOR_TIPO[tipo] ?? '#64748B',
      vigor: 1,
      reciente: false,
      obsoleta: false,
      lecturas: 0,
      grado: grado.get(h) ?? 0,
      importancia: 0,
    });
  }

  // conservar posiciones: que una nota nueva no reacomode todo el cerebro
  if (previo) {
    for (const n of nodos) {
      const p = previo.get(n.id);
      if (p) Object.assign(n, { x: p.x, y: p.y, z: p.z, vx: 0, vy: 0, vz: 0 });
    }
  }

  return {
    nodos,
    enlaces: aristas.map((a) => ({ source: a.origen, target: a.destino, clase: a.clase })),
  };
}
