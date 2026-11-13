import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import { COLOR_TIPO, SINGULAR_TIPO } from '../lib/tipos.ts';
import { MUELLE } from './comun.tsx';

/** Buscar con el mismo motor que usan los agentes. Mientras escribes, los resultados se encienden en el tejido. */
export function Buscador({ cerebro }: { cerebro: string }) {
  const { buscando, setBuscando, seleccionar, resaltar } = useApp();
  const [q, setQ] = useState('');
  const [consulta, setConsulta] = useState('');
  const [fila, setFila] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setConsulta(q.trim()), 130);
    return () => clearTimeout(t);
  }, [q]);
  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['buscar', cerebro, consulta],
    queryFn: () => api.buscar(cerebro, consulta),
    enabled: buscando && consulta.length > 1,
    placeholderData: (p) => p,
  });
  const lista = consulta.length > 1 ? resultados : [];
  useEffect(() => setFila(0), [consulta]);
  // los resultados se encienden en el tejido, detrás del buscador
  useEffect(() => {
    if (buscando) resaltar(lista.map((r) => r.id), 'busqueda');
  }, [buscando, lista.map((r) => r.id).join('|')]);
  useEffect(() => {
    if (!buscando) setQ('');
  }, [buscando]);
  const elegido = lista[fila];

  return (
    <AnimatePresence>
      {buscando && (
        <motion.div className="velo buscar-velo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setBuscando(false)}>
          <motion.div className="buscador vidrio" role="dialog" aria-label="Buscar en el cerebro" initial={{ opacity: 0, y: -24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -14, scale: 0.98 }} transition={MUELLE} onClick={(e) => e.stopPropagation()}>
            <label>
              <Search size={21} />
              <input
                autoFocus
                value={q}
                placeholder={`Busca en ${cerebro}`}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setFila((f) => Math.min(f + 1, lista.length - 1));
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setFila((f) => Math.max(f - 1, 0));
                  }
                  if (e.key === 'Enter' && elegido) seleccionar(elegido.id);
                }}
              />
              <kbd>Esc</kbd>
            </label>
            {lista.length > 0 && (
              <div className="resultados">
                <ul>
                  {lista.map((r, i) => (
                    <li key={r.id}>
                      <button type="button" className={i === fila ? 'aqui' : ''} onMouseEnter={() => setFila(i)} onClick={() => seleccionar(r.id)}>
                        {i === fila && <motion.span layoutId="fila-buscar" className="marca-p" transition={{ type: 'spring', stiffness: 600, damping: 44 }} />}
                        <i style={{ background: COLOR_TIPO[r.tipo], color: COLOR_TIPO[r.tipo] }} />
                        <b>{r.titulo}</b>
                        <em>{SINGULAR_TIPO[r.tipo]}</em>
                      </button>
                    </li>
                  ))}
                </ul>
                {elegido && (
                  <motion.div className="vista" key={elegido.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }} style={{ '--punto': COLOR_TIPO[elegido.tipo] } as React.CSSProperties}>
                    <h3>{elegido.titulo}</h3>
                    <p>{elegido.descripcion}</p>
                    <blockquote>{elegido.fragmento.replace(/[#*`>|]/g, '')}</blockquote>
                    <span>
                      <CornerDownLeft size={13} /> Intro la abre y enciende sus conexiones
                    </span>
                  </motion.div>
                )}
              </div>
            )}
            {consulta.length > 1 && !isFetching && lista.length === 0 && <p className="vacio">Nada con esas palabras. Prueba con menos, o con otra forma de decirlo.</p>}
            {consulta.length <= 1 && <p className="vacio">Es la misma búsqueda que usan tus agentes: por relevancia, sin importar tildes ni plurales. Lo que encuentre se enciende en el tejido.</p>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
