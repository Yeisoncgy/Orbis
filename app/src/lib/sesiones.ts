// De eventos sueltos a sesiones: qué hizo cada agente con el cerebro, en orden.
import type { EventoApi } from './api.ts';

export type ClasePaso = 'mapa' | 'buscar' | 'falla' | 'leer' | 'escribir' | 'estado';

export interface Paso {
  clase: ClasePaso;
  titulo: string;
  detalle: string;
  ts: number;
  notas: string[];
  tokens: number;
}

export interface Sesion {
  id: string;
  proyecto?: string;
  inicio: number;
  fin: number;
  pasos: Paso[];
  tokens: number;
  /** con actividad en los últimos minutos */
  viva: boolean;
}

const PAUSA_MS = 30 * 60 * 1000;
const VIVA_MS = 3 * 60 * 1000;
const miles = (n: number) => n.toLocaleString('es');

function paso(e: EventoApi, titulo: (id: string) => string): Paso {
  const ts = new Date(e.ts).getTime();
  const tokens = e.tokens ?? 0;
  const lista = e.notas.length ? titulo(e.notas[0]) + (e.notas.length > 1 ? ` y ${e.notas.length - 1} más` : '') : '';
  const costo = tokens ? `${miles(tokens)} tokens` : '';
  const base = { ts, notas: e.notas, tokens };
  if (e.accion === 'mapa') return { ...base, clase: 'mapa', titulo: e.consulta ? `Mapa de ${e.consulta}` : 'Cargó el mapa', detalle: costo };
  if (e.accion === 'buscar') {
    const que = e.consulta ? `«${e.consulta}»` : lista || 'Buscó';
    if (e.consulta && e.notas.length === 0) return { ...base, clase: 'falla', titulo: que, detalle: 'buscó y no había nada' };
    return { ...base, clase: 'buscar', titulo: que, detalle: e.consulta ? `buscó; ${e.notas.length} ${e.notas.length === 1 ? 'resultado' : 'resultados'}` : 'miró la ficha' };
  }
  if (e.accion === 'leer') return { ...base, clase: 'leer', titulo: lista, detalle: ['leyó', costo].filter(Boolean).join(', ') };
  if (e.accion === 'escribir') return { ...base, clase: 'escribir', titulo: lista, detalle: 'queda sin revisar' };
  return { ...base, clase: 'estado', titulo: lista, detalle: 'cambió su estado' };
}

/** Agrupa por sesión de Claude Code; una pausa larga dentro de la misma sesión abre otra */
export function agrupar(eventos: EventoApi[], titulo: (id: string) => string, ahora = Date.now()): Sesion[] {
  const sesiones: Sesion[] = [];
  const abierta = new Map<string, Sesion>();
  for (const e of [...eventos].sort((a, b) => a.ts.localeCompare(b.ts))) {
    const clave = e.sesion ?? `proceso ${e.pid}`;
    const p = paso(e, titulo);
    let s = abierta.get(clave);
    if (!s || p.ts - s.fin > PAUSA_MS) {
      s = { id: `${clave}@${p.ts}`, proyecto: e.proyecto, inicio: p.ts, fin: p.ts, pasos: [], tokens: 0, viva: false };
      abierta.set(clave, s);
      sesiones.push(s);
    }
    s.pasos.push(p);
    s.fin = p.ts;
    s.tokens += p.tokens;
  }
  for (const s of sesiones) s.viva = ahora - s.fin < VIVA_MS;
  return sesiones;
}

export const nombreSesion = (s: Sesion) => s.id.split('@')[0];
export const hora = (ts: number) => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
