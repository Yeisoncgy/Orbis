import type { CerebroApi, EventoApi, GrafoApi, NotaApi, ResultadoApi, RevisionApi, SaludApi } from '../../../servidor/api-tipos.ts';

async function pedir<T>(ruta: string): Promise<T> {
  const r = await fetch(`/api${ruta}`);
  if (!r.ok) {
    const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(cuerpo.error ?? `Error ${r.status}`);
  }
  return (await r.json()) as T;
}

const c = encodeURIComponent;

export const api = {
  cerebros: () => pedir<CerebroApi[]>('/cerebros'),
  grafo: (cerebro: string) => pedir<GrafoApi>(`/cerebros/${c(cerebro)}/grafo`),
  nota: (cerebro: string, id: string) => pedir<NotaApi>(`/cerebros/${c(cerebro)}/notas/${c(id)}`),
  buscar: (cerebro: string, q: string) => pedir<ResultadoApi[]>(`/cerebros/${c(cerebro)}/buscar?q=${c(q)}`),
  actividad: (cerebro: string) => pedir<EventoApi[]>(`/cerebros/${c(cerebro)}/actividad?limite=600`),
  revisar: (cerebro: string) => pedir<RevisionApi[]>(`/cerebros/${c(cerebro)}/revisar`),
  salud: (cerebro: string) => pedir<SaludApi>(`/cerebros/${c(cerebro)}/salud`),
};

export type { CerebroApi, EventoApi, GrafoApi, NotaApi, ResultadoApi, RevisionApi, SaludApi };
export type { NodoApi, AristaApi, VecinoApi } from '../../../servidor/api-tipos.ts';
