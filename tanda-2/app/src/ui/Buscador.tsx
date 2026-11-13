import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import { COLOR_TIPO, SINGULAR_TIPO } from '../lib/tipos.ts';

export function Buscador({ cerebro }: { cerebro: string }) {
  const busqueda = useApp((s) => s.busqueda);
  const setBusqueda = useApp((s) => s.setBusqueda);
  const setResaltadas = useApp((s) => s.setResaltadas);
  const seleccionar = useApp((s) => s.seleccionar);
  const setHover = useApp((s) => s.setHover);
  const [diferida, setDiferida] = useState(busqueda);
  const [enfocado, setEnfocado] = useState(false);
  const [indice, setIndice] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDiferida(busqueda.trim()), 140);
    return () => clearTimeout(t);
  }, [busqueda]);

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['buscar', cerebro, diferida],
    queryFn: () => api.buscar(cerebro, diferida),
    enabled: diferida.length > 1,
    placeholderData: (previo) => previo,
  });
  const activos = useMemo(() => (diferida.length > 1 ? resultados.slice(0, 7) : []), [diferida, resultados]);

  useEffect(() => {
    setResaltadas(activos.length ? new Set(activos.map((r) => r.id)) : undefined);
    setIndice(0);
  }, [activos, setResaltadas]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.key === '/' && !escribiendo) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        entrada.current?.focus();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  const abrir = (id: string) => {
    seleccionar(id);
    entrada.current?.blur();
  };
  const abierto = enfocado && diferida.length > 1;

  return (
    <div className="relative w-[min(520px,calc(100vw-2rem))]">
      <label className={`vidrio flex h-11 items-center gap-2.5 rounded-full pl-4 pr-2 transition-shadow duration-300 ${enfocado ? 'shadow-[0_0_0_4px_rgb(61_90_254/0.1),0_16px_40px_-14px_rgb(12_25_41/0.3)]' : ''}`}>
        <Search className="size-4 shrink-0 text-secundario" strokeWidth={1.5} />
        <input
          ref={entrada}
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setTimeout(() => setEnfocado(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setBusqueda('');
              entrada.current?.blur();
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndice((i) => Math.min(i + 1, activos.length - 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndice((i) => Math.max(i - 1, 0));
            }
            if (e.key === 'Enter' && activos[indice]) abrir(activos[indice].id);
          }}
          placeholder="Buscar en el cerebro"
          aria-label="Buscar en el cerebro"
          className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-navy outline-none placeholder:text-secundario"
        />
        {isFetching && diferida.length > 1 && <span className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[#C3CBD6] border-t-navy" />}
        {busqueda ? (
          <button type="button" onClick={() => setBusqueda('')} className="rounded-full p-1.5 text-secundario hover:bg-white hover:text-navy" aria-label="Limpiar búsqueda">
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        ) : (
          <kbd className="rounded-full border border-borde bg-white/70 px-2 font-mono text-[10.5px] leading-[22px] text-secundario">Ctrl K</kbd>
        )}
      </label>

      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="vidrio absolute inset-x-0 top-[calc(100%+8px)] origin-top overflow-hidden rounded-3xl p-2"
          >
            {activos.length === 0 ? (
              <p className="px-3 py-4 text-[12.5px] text-secundario">{isFetching ? 'Buscando' : 'Nada en este cerebro coincide con eso.'}</p>
            ) : (
              <ul onMouseLeave={() => setHover(undefined)}>
                {activos.map((r, i) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => abrir(r.id)}
                      onMouseEnter={() => {
                        setIndice(i);
                        setHover(r.id);
                      }}
                      className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-150 ${i === indice ? 'bg-white shadow-[0_1px_3px_rgb(12_25_41/0.08)]' : ''}`}
                    >
                      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: COLOR_TIPO[r.tipo], boxShadow: `0 0 0 3px ${COLOR_TIPO[r.tipo]}22` }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[13px] font-semibold text-navy">{r.titulo}</span>
                          <span className="shrink-0 text-[10.5px] font-medium text-secundario">{SINGULAR_TIPO[r.tipo]}</span>
                        </span>
                        <span className="mt-0.5 line-clamp-1 block text-[12px] text-secundario">{r.descripcion}</span>
                      </span>
                      {i === indice && <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-secundario" strokeWidth={1.5} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
