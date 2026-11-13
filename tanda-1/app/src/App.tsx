import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { Grafo3D } from './grafo/Grafo3D.tsx';
import { api } from './lib/api.ts';
import { useApp } from './lib/estado.ts';
import { useActividadEnVivo } from './lib/eventos.ts';
import { BarraCerebros } from './ui/BarraCerebros.tsx';
import { Buscador } from './ui/Buscador.tsx';
import { PanelNota } from './ui/PanelNota.tsx';
import { Cifras, Controles, Filtros, ListaNotas, Salud, Senales } from './ui/Superficie.tsx';

const SUAVE = [0.22, 1, 0.36, 1] as const;

function Entrada({ children, retardo, desde, className }: { children: ReactNode; retardo: number; desde: 'arriba' | 'abajo'; className: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: desde === 'arriba' ? -14 : 14, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ duration: 0.8, ease: SUAVE, delay: retardo }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Vacio({ titulo, texto }: { titulo: string; texto: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-8">
      <div className="max-w-md text-center">
        <img src="/marca.svg" alt="" className="mx-auto size-12" />
        <h1 className="mt-5 text-[19px] font-semibold tracking-[-0.015em] text-navy">{titulo}</h1>
        <div className="mt-2 text-[13.5px] leading-relaxed text-secundario">{texto}</div>
      </div>
    </div>
  );
}

export function App() {
  const cerebro = useApp((s) => s.cerebro);
  const elegir = useApp((s) => s.elegirCerebro);
  const seleccion = useApp((s) => s.seleccion);
  const seleccionar = useApp((s) => s.seleccionar);
  const lista = useApp((s) => s.lista);
  const conexion = useActividadEnVivo();

  const cerebros = useQuery({ queryKey: ['cerebros'], queryFn: api.cerebros });
  const grafo = useQuery({ queryKey: ['grafo', cerebro], queryFn: () => api.grafo(cerebro!), enabled: !!cerebro, placeholderData: (p) => p });

  // Enlace directo: ?cerebro=mi-proyecto&nota=decision-ejemplo
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const pedido = p.get('cerebro');
    if (pedido) elegir(pedido);
    const nota = p.get('nota');
    if (nota) setTimeout(() => seleccionar(nota), 2600);
  }, [elegir, seleccionar]);

  useEffect(() => {
    const lista = cerebros.data;
    if (!lista?.length) return;
    if (!cerebro || !lista.some((c) => c.nombre === cerebro)) elegir(lista[0].nombre);
  }, [cerebros.data, cerebro, elegir]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) seleccionar(undefined);
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [seleccionar]);

  const datos = grafo.data && grafo.data.meta.nombre === cerebro ? grafo.data : undefined;

  return (
    <main className="relative h-full w-full overflow-hidden">
      <div className="fondo" aria-hidden />

      {cerebros.isError && <Vacio titulo="No se pudo conectar con Orbis" texto="El servidor local no responde. Vuelve a abrir Orbis." />}
      {cerebros.data?.length === 0 && (
        <Vacio
          titulo="Aún no hay cerebros"
          texto={
            <>
              Crea el primero desde una sesión de Claude Code con <code className="font-mono text-navy">/cerebro nuevo</code>.
            </>
          }
        />
      )}

      {datos && <Grafo3D datos={datos} />}
      {datos && datos.nodos.length === 0 && (
        <Vacio titulo="Este cerebro está vacío" texto="Cuando un agente guarde la primera nota, aparecerá aquí como una neurona." />
      )}

      {cerebros.data && cerebros.data.length > 0 && (
        <>
          <Entrada retardo={0.15} desde="arriba" className="absolute left-5 top-5 z-10">
            <BarraCerebros cerebros={cerebros.data} />
          </Entrada>
          {cerebro && (
            <Entrada retardo={0.3} desde="arriba" className="absolute left-1/2 top-5 z-20 -translate-x-1/2">
              <Buscador cerebro={cerebro} />
            </Entrada>
          )}
          <Entrada retardo={0.45} desde="arriba" className="absolute right-5 top-5 z-10 hidden xl:block">
            <Cifras grafo={datos} conexion={conexion} />
          </Entrada>
          {cerebro && (
            <Entrada retardo={0.6} desde="abajo" className="absolute bottom-[4.5rem] left-5 z-10 hidden md:block">
              <Senales cerebro={cerebro} grafo={datos} />
            </Entrada>
          )}
          {datos && lista && (
            <Entrada retardo={0} desde="arriba" className="absolute bottom-80 left-5 top-20 z-10 hidden md:block">
              <ListaNotas grafo={datos} />
            </Entrada>
          )}
          {datos && (
            <Entrada retardo={0.75} desde="abajo" className="absolute bottom-5 left-1/2 z-10 -translate-x-1/2">
              <Filtros grafo={datos} />
            </Entrada>
          )}
          <Entrada retardo={0.9} desde="abajo" className="absolute bottom-5 right-5 z-10">
            <Controles />
          </Entrada>
          {datos && cerebro && (
            <Entrada retardo={1} desde="abajo" className="absolute bottom-[4.5rem] right-5 z-10 hidden md:block">
              <Salud cerebro={cerebro} grafo={datos} />
            </Entrada>
          )}
        </>
      )}

      <div className="pointer-events-none absolute bottom-20 right-5 top-20 z-30 flex w-[min(460px,calc(100vw-2.5rem))] justify-end">
        <AnimatePresence>
          {seleccion && cerebro && (
            <div key="nota" className="pointer-events-auto flex min-h-0 w-full">
              <PanelNota cerebro={cerebro} id={seleccion} />
            </div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
