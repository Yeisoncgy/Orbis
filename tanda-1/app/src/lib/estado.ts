import { create } from 'zustand';
import type { Tipo } from '../../../core/src/tipos.ts';
import { ORDEN_TIPOS } from './tipos.ts';

const CLAVE = 'cerebro-app-preferencias';

interface Preferencias {
  cerebro?: string;
  rotacion: boolean;
  obsoletas: boolean;
  /** panel con todas las notas en lista, al lado del grafo */
  lista: boolean;
}

function leerPreferencias(): Preferencias {
  try {
    return { rotacion: false, obsoletas: false, lista: false, ...(JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as Partial<Preferencias>) };
  } catch {
    return { rotacion: false, obsoletas: false, lista: false };
  }
}

interface EstadoApp extends Preferencias {
  seleccion?: string;
  hover?: string;
  tiposOcultos: Set<Tipo>;
  busqueda: string;
  resaltadas?: Set<string>;
  elegirCerebro: (nombre: string) => void;
  seleccionar: (id?: string) => void;
  setHover: (id?: string) => void;
  alternarTipo: (tipo: Tipo) => void;
  soloTipo: (tipo: Tipo) => void;
  setBusqueda: (q: string) => void;
  setResaltadas: (ids?: Set<string>) => void;
  setRotacion: (v: boolean) => void;
  setObsoletas: (v: boolean) => void;
  setLista: (v: boolean) => void;
}

const inicial = leerPreferencias();

function guardar(p: Partial<Preferencias>): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...leerPreferencias(), ...p }));
  } catch {
    // almacenamiento bloqueado: la preferencia vale solo esta sesión
  }
}

export const useApp = create<EstadoApp>((set, get) => ({
  ...inicial,
  tiposOcultos: new Set(),
  busqueda: '',
  elegirCerebro: (cerebro) => {
    guardar({ cerebro });
    set({ cerebro, seleccion: undefined, busqueda: '', resaltadas: undefined, tiposOcultos: new Set() });
  },
  seleccionar: (seleccion) => set({ seleccion }),
  setHover: (hover) => set({ hover }),
  alternarTipo: (tipo) => {
    const ocultos = new Set(get().tiposOcultos);
    if (ocultos.has(tipo)) ocultos.delete(tipo);
    else ocultos.add(tipo);
    set({ tiposOcultos: ocultos });
  },
  soloTipo: (tipo) => {
    const ocultos = get().tiposOcultos;
    const yaSolo = ocultos.size === ORDEN_TIPOS.length - 1 && !ocultos.has(tipo);
    set({ tiposOcultos: yaSolo ? new Set() : new Set(ORDEN_TIPOS.filter((t) => t !== tipo)) });
  },
  setBusqueda: (busqueda) => set({ busqueda }),
  setResaltadas: (resaltadas) => set({ resaltadas }),
  setRotacion: (rotacion) => {
    guardar({ rotacion });
    set({ rotacion });
  },
  setObsoletas: (obsoletas) => {
    guardar({ obsoletas });
    set({ obsoletas });
  },
  setLista: (lista) => {
    guardar({ lista });
    set({ lista });
  },
}));

// Pulsos de actividad: van directo al grafo sin pasar por React (no deben re-renderizar nada)
type Oyente = (ids: string[], accion: string) => void;
const oyentes = new Set<Oyente>();

export const pulsos = {
  emitir: (ids: string[], accion: string) => oyentes.forEach((o) => o(ids, accion)),
  escuchar: (o: Oyente) => {
    oyentes.add(o);
    return () => {
      oyentes.delete(o);
    };
  },
};
