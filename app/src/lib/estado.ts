import { create } from 'zustand';
import type { Tipo } from '../../../core/src/tipos.ts';

const CLAVE = 'orbis-preferencias';

function leerCerebro(): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(CLAVE) ?? '{}') as { cerebro?: string }).cerebro;
  } catch {
    return undefined;
  }
}

export interface Aviso {
  id: number;
  texto: string;
  clase: 'vivo' | 'hecho';
}

interface EstadoApp {
  cerebro?: string;
  /** nota abierta en el panel de lectura */
  seleccion?: string;
  /** sesión cuyo hilo se muestra; sin elegir, la más reciente */
  sesion?: string;
  /** al repetir una sesión pasada: hasta qué momento se ha mostrado */
  momento?: number;
  reproduciendo: boolean;
  /** en vivo: el tejido gira solo y el hilo sigue a la última sesión */
  enVivo: boolean;
  buscando: boolean;
  revisando: boolean;
  atajos: boolean;
  /** un solo tipo encendido; los demás se atenúan */
  soloTipo?: Tipo;
  /** notas encendidas en el tejido (resultados de búsqueda, notas por comprobar…) */
  resaltadas: string[];
  motivoResalte?: string;
  /** neurona sacada del tejido: cuántas notas la citan y a cuántas cita */
  /** camino: las neuronas por las que se ha pasado, la actual al final */
  jalando?: { id: string; laCitan: number; citaA: number; camino: string[] };
  avisos: Aviso[];
  elegirCerebro: (nombre: string) => void;
  seleccionar: (id?: string) => void;
  elegirSesion: (id?: string, desde?: number) => void;
  setMomento: (t?: number) => void;
  setReproduciendo: (v: boolean) => void;
  setEnVivo: (v: boolean) => void;
  setBuscando: (v: boolean) => void;
  setRevisando: (v: boolean) => void;
  setAtajos: (v: boolean) => void;
  alternarTipo: (tipo: Tipo) => void;
  resaltar: (ids: string[], motivo?: string) => void;
  setJalando: (j?: EstadoApp['jalando']) => void;
  avisar: (texto: string, clase?: Aviso['clase']) => void;
}

let serie = 0;
const parametros = new URLSearchParams(location.search);

export const useApp = create<EstadoApp>((set, get) => ({
  cerebro: parametros.get('cerebro') ?? leerCerebro(),
  seleccion: parametros.get('nota') ?? undefined,
  reproduciendo: false,
  enVivo: true,
  buscando: false,
  revisando: false,
  atajos: false,
  resaltadas: [],
  avisos: [],
  elegirCerebro: (cerebro) => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ cerebro }));
    } catch {
      // almacenamiento bloqueado: la preferencia vale solo esta sesión
    }
    set({ cerebro, seleccion: undefined, sesion: undefined, momento: undefined, reproduciendo: false, soloTipo: undefined, resaltadas: [], motivoResalte: undefined, revisando: false, enVivo: true });
  },
  seleccionar: (seleccion) => set({ seleccion, buscando: false, resaltadas: [], motivoResalte: undefined }),
  elegirSesion: (sesion, desde) => set({ sesion, momento: desde, reproduciendo: sesion !== undefined && desde !== undefined, enVivo: sesion === undefined, seleccion: undefined }),
  setMomento: (momento) => set({ momento }),
  setReproduciendo: (reproduciendo) => set({ reproduciendo }),
  setEnVivo: (enVivo) => set(enVivo ? { enVivo, sesion: undefined, momento: undefined, reproduciendo: false } : { enVivo }),
  setBuscando: (buscando) => set(buscando ? { buscando } : { buscando, resaltadas: get().motivoResalte === 'busqueda' ? [] : get().resaltadas, motivoResalte: get().motivoResalte === 'busqueda' ? undefined : get().motivoResalte }),
  setRevisando: (revisando) => set({ revisando }),
  setAtajos: (atajos) => set({ atajos }),
  alternarTipo: (tipo) => set({ soloTipo: get().soloTipo === tipo ? undefined : tipo }),
  resaltar: (resaltadas, motivoResalte) => set({ resaltadas, motivoResalte: resaltadas.length ? motivoResalte : undefined }),
  setJalando: (jalando) => set({ jalando }),
  avisar: (texto, clase = 'hecho') => {
    const id = ++serie;
    set({ avisos: [...get().avisos.slice(-2), { id, texto, clase }] });
    setTimeout(() => set({ avisos: get().avisos.filter((a) => a.id !== id) }), clase === 'vivo' ? 4200 : 2600);
  },
}));

// Pulsos de actividad: van directo al tejido sin pasar por React (no deben volver a pintar nada)
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
