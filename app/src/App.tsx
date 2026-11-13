import { useQuery } from '@tanstack/react-query';
import { AnimatePresence } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { api } from './lib/api.ts';
import { pulsos, useApp } from './lib/estado.ts';
import { useActividadEnVivo } from './lib/eventos.ts';
import { usePestana } from './lib/pestana.ts';
import { agrupar } from './lib/sesiones.ts';
import { Tejido } from './tejido/Tejido.tsx';
import { Buscador } from './ui/Buscador.tsx';
import { Marca } from './ui/Marca.tsx';
import { Atajos, Avisos, Barra, Camino, Titular, Vitales } from './ui/Marco.tsx';
import { Nota } from './ui/Nota.tsx';
import { Revisar } from './ui/Revisar.tsx';
import { Cinta, Hilo } from './ui/Sesion.tsx';

const VERBO: Record<string, string> = { leer: 'Leyó', escribir: 'Escribió', buscar: 'Buscó y encontró', estado: 'Cambió el estado de' };

export function App() {
  const conexion = useActividadEnVivo();
  const preferido = useApp((s) => s.cerebro);
  const { seleccion, sesion: sesionElegida, momento, reproduciendo, jalando } = useApp();
  const { data: cerebros, error } = useQuery({ queryKey: ['cerebros'], queryFn: api.cerebros });
  const cerebro = cerebros?.some((c) => c.nombre === preferido) ? preferido : cerebros?.[0]?.nombre;
  const { data: grafo } = useQuery({ queryKey: ['grafo', cerebro], queryFn: () => api.grafo(cerebro as string), enabled: !!cerebro });
  const { data: actividad = [] } = useQuery({ queryKey: ['actividad', cerebro], queryFn: () => api.actividad(cerebro as string), enabled: !!cerebro });
  const { data: salud } = useQuery({ queryKey: ['salud', cerebro, grafo?.nodos.length, actividad.length], queryFn: () => api.salud(cerebro as string), enabled: !!cerebro && !!grafo, placeholderData: (p) => p });

  // «pensando» depende de la hora: se vuelve a mirar cada veinte segundos
  const [reloj, setReloj] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setReloj(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const titulos = useMemo(() => new Map((grafo?.nodos ?? []).map((n) => [n.id, n.titulo])), [grafo]);
  const titulo = (id: string) => titulos.get(id) ?? id.replace(/-/g, ' ');
  const sesiones = useMemo(() => agrupar(actividad, (id) => titulos.get(id) ?? id.replace(/-/g, ' '), reloj), [actividad, titulos, reloj]);
  const mostrada = sesiones.find((s) => s.id === sesionElegida) ?? sesiones.at(-1);
  const hilo = useMemo(() => {
    // las últimas notas que leyó o escribió la sesión hasta el momento que se muestra, en orden y sin repetir
    const ids = (mostrada?.pasos ?? []).filter((p) => (p.clase === 'leer' || p.clase === 'escribir') && p.ts <= (momento ?? Infinity)).flatMap((p) => p.notas);
    return [...new Set(ids.reverse())].slice(0, 5).reverse();
  }, [mostrada, momento]);

  // repetir una sesión: avanza de paso en paso y enciende lo que tocó cada uno
  useEffect(() => {
    if (!reproduciendo || !mostrada) return;
    const siguiente = mostrada.pasos.find((p) => p.ts > (momento ?? -Infinity));
    if (!siguiente) {
      useApp.getState().setReproduciendo(false);
      return;
    }
    const t = setTimeout(() => {
      useApp.getState().setMomento(siguiente.ts);
      pulsos.emitir(siguiente.notas, siguiente.clase);
    }, momento === mostrada.inicio ? 350 : 950);
    return () => clearTimeout(t);
  }, [reproduciendo, momento, mostrada]);

  // lo que hace un agente en vivo se anuncia en una línea
  useEffect(
    () =>
      pulsos.escuchar((ids, accion) => {
        const s = useApp.getState();
        if (s.sesion !== undefined || !ids.length || !VERBO[accion]) return;
        s.avisar(`${VERBO[accion]} ${titulos.get(ids[0]) ?? ids[0]}${ids.length > 1 ? ` y ${ids.length - 1} más` : ''}`, 'vivo');
      }),
    [titulos],
  );

  // la luz del cursor sobre el vidrio: cada panel se aclara donde está el puntero
  useEffect(() => {
    let antes: HTMLElement | null = null;
    const mover = (e: PointerEvent) => {
      const panel = (e.target as Element | null)?.closest?.<HTMLElement>('.vidrio') ?? null;
      if (antes && antes !== panel) antes.style.removeProperty('--mx');
      antes = panel;
      if (!panel) return;
      const r = panel.getBoundingClientRect();
      panel.style.setProperty('--mx', `${e.clientX - r.left}px`);
      panel.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    addEventListener('pointermove', mover, { passive: true });
    return () => removeEventListener('pointermove', mover);
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const s = useApp.getState();
      const escribiendo = /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement).tagName);
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !escribiendo)) {
        e.preventDefault();
        return s.setBuscando(true);
      }
      if (e.key === 'Escape') {
        if (s.buscando) return s.setBuscando(false);
        if (s.atajos) return s.setAtajos(false);
        if (s.revisando) return s.setRevisando(false);
        if (s.resaltadas.length) return s.resaltar([]);
        if (s.seleccion) return s.seleccionar(undefined);
        if (s.jalando) return void dispatchEvent(new Event('orbis:recoger'));
        if (s.sesion) return s.setEnVivo(true);
      }
      if (escribiendo || s.buscando || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'r' && !s.revisando) s.setRevisando(true);
      if (e.key === '?') s.setAtajos(!s.atajos);
      if (e.key === ' ' && !s.revisando) {
        e.preventDefault();
        if (s.sesion) s.setReproduciendo(!s.reproduciendo);
        else s.setEnVivo(!s.enVivo);
      }
      if (e.key === '0') dispatchEvent(new Event('orbis:recentrar'));
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, []);

  usePestana(cerebro, !!sesiones.at(-1)?.viva, (grafo?.nodos ?? []).filter((n) => n.estado === 'reciente').length);

  if (error) {
    return (
      <main className="aviso-central">
        <h1>No se pudo conectar con Orbis</h1>
        <p>El servidor se apagó o se cerró. Vuelve a abrirlo con «Abrir Orbis» y recarga esta página.</p>
      </main>
    );
  }
  if (cerebros && cerebros.length === 0) {
    return (
      <main className="aviso-central">
        <h1>Aún no hay cerebros</h1>
        <p>Crea el primero desde una sesión de Claude Code con «/cerebro nuevo».</p>
      </main>
    );
  }
  if (!cerebro || !grafo || !cerebros) {
    return (
      <main className="aviso-central cargando">
        <Marca lado={72} viva />
      </main>
    );
  }

  const recientes = grafo.nodos.filter((n) => n.estado === 'reciente').length;
  return (
    <>
      <div className="agua" aria-hidden="true" />
      <Tejido grafo={grafo} hilo={hilo} panelAncho={seleccion ? 440 : 372} />
      <div className="grano" aria-hidden="true" />
      <Barra cerebros={cerebros} cerebro={cerebro} recientes={recientes} conexion={conexion} viva={!!sesiones.at(-1)?.viva} />
      <div className={`izquierda${jalando ? ' aparte' : ''}`}>
        <Titular cerebro={cerebro} sesion={mostrada} />
        <Vitales salud={salud} grafo={grafo} />
      </div>
      <AnimatePresence mode="popLayout">
        {seleccion ? <Nota key="nota" cerebro={cerebro} id={seleccion} /> : jalando ? null : <Hilo key={`hilo-${mostrada?.id ?? 'vacio'}`} sesion={mostrada} momento={sesionElegida ? momento : undefined} />}
      </AnimatePresence>
      <div className={jalando ? (seleccion ? 'apartados' : 'centrados') : undefined}>
        <Camino titulo={titulo} />
        <Avisos titulo={titulo} />
      </div>
      <Cinta sesiones={sesiones} mostrada={mostrada} />
      <Buscador cerebro={cerebro} />
      <Revisar cerebro={cerebro} />
      <Atajos />
    </>
  );
}
