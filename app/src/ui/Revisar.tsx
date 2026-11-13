import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import { fechaCorta } from '../lib/tiempo.ts';
import { COLOR_TIPO, SINGULAR_TIPO } from '../lib/tipos.ts';
import { contenido, Copiar, MUELLE } from './comun.tsx';

function Hoja({ cerebro, id, rotulo }: { cerebro: string; id: string; rotulo: string }) {
  const { data: nota } = useQuery({ queryKey: ['nota', cerebro, id], queryFn: () => api.nota(cerebro, id) });
  const html = useMemo(() => (nota ? contenido(nota) : ''), [nota]);
  return (
    <motion.article className="hoja" style={{ '--punto': nota ? COLOR_TIPO[nota.tipo] : '#7CFFE1' } as React.CSSProperties} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={MUELLE}>
      <p className="clase">
        <i style={{ background: 'var(--punto)', color: 'var(--punto)' }} />
        {rotulo}
        {nota ? ` · ${SINGULAR_TIPO[nota.tipo]}` : ''}
      </p>
      {nota && (
        <>
          <h3>{nota.titulo}</h3>
          <p className="resumen-n">{nota.descripcion}</p>
          <p className="dato">
            {nota.estado === 'reciente' ? `La escribió ${nota.origen === 'agente' ? 'un agente' : (nota.origen ?? 'alguien')} el ${fechaCorta(nota.actualizado)}` : `Verificada el ${fechaCorta(nota.verificado ?? nota.actualizado)} · ${nota.lecturas} lecturas`}
          </p>
          <div className="texto" dangerouslySetInnerHTML={{ __html: html }} />
        </>
      )}
    </motion.article>
  );
}

/**
 * La mesa de revisión: lo que escribió un agente, junto a la nota que más se le parece.
 * Orbis no cambia las notas: cada decisión copia la orden para Claude Code.
 */
export function Revisar({ cerebro }: { cerebro: string }) {
  const { revisando, setRevisando, seleccionar } = useApp();
  const { data: pendientes = [] } = useQuery({ queryKey: ['revisar', cerebro], queryFn: () => api.revisar(cerebro), enabled: revisando });
  const [i, setI] = useState(0);
  const actual = pendientes[Math.min(i, pendientes.length - 1)];
  const otra = actual?.parecidas[0];

  useEffect(() => {
    if (!revisando) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'j' || e.key === 'ArrowDown') setI((n) => Math.min(n + 1, pendientes.length - 1));
      if (e.key === 'k' || e.key === 'ArrowUp') setI((n) => Math.max(n - 1, 0));
    };
    addEventListener('keydown', tecla);
    return () => removeEventListener('keydown', tecla);
  }, [revisando, pendientes.length]);

  return (
    <AnimatePresence>
      {revisando && (
        <motion.div className="velo mesa-velo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRevisando(false)}>
          <motion.div className="mesa vidrio" role="dialog" aria-label="Revisar lo nuevo" initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.98 }} transition={MUELLE} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="cerrar" onClick={() => setRevisando(false)} aria-label="Cerrar">
              <X size={18} />
            </button>
            <header>
              <h2>Lo nuevo, sin revisar</h2>
              <p>{pendientes.length === 0 ? 'No hay nada pendiente.' : `${pendientes.length === 1 ? 'Una nota espera' : `${pendientes.length} notas esperan`} tu visto bueno. Las escribieron tus agentes; hasta que las revises, salen marcadas como no confiables.`}</p>
            </header>
            {pendientes.length === 0 ? (
              <div className="mesa-vacia">
                <div className="orbe-ok" />
                <h3>Todo revisado</h3>
                <p>Cuando un agente escriba algo nuevo, aparecerá aquí junto a la nota que más se le parezca.</p>
              </div>
            ) : (
              <div className="mesa-cuerpo">
                <ol className="pila">
                  {pendientes.map((p, n) => (
                    <li key={p.id}>
                      <button type="button" className={n === i ? 'aqui' : ''} onClick={() => setI(n)}>
                        {n === i && <motion.span layoutId="pendiente" className="marca-p" transition={MUELLE} />}
                        <i style={{ background: COLOR_TIPO[p.tipo], color: COLOR_TIPO[p.tipo] }} />
                        <b>{p.titulo}</b>
                        <span>{p.parecidas[0] ? `se parece en un ${Math.round(p.parecidas[0].cuanto * 100)} % a otra` : 'no se parece a ninguna'}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                {actual && (
                  <div className="comparar">
                    <div className={`hojas${otra ? '' : ' una'}`} key={actual.id}>
                      <Hoja cerebro={cerebro} id={actual.id} rotulo="La nueva" />
                      {otra && (
                        <>
                          <div className="parecido" aria-hidden="true">
                            <b>{Math.round(otra.cuanto * 100)}%</b>
                            <span>parecidas</span>
                          </div>
                          <Hoja cerebro={cerebro} id={otra.id} rotulo="La que ya tenías" />
                        </>
                      )}
                    </div>
                    <footer>
                      <Copiar clase="fuerte" texto={`Con la skill /cerebro: lee la nota [${actual.id}] del cerebro ${cerebro}, contrástala con el repositorio y, si es correcta, márcala consolidada.`} aviso="Orden copiada: pégala en Claude Code">
                        Aprobar
                      </Copiar>
                      {otra && (
                        <Copiar texto={`Con la skill /cerebro: en el cerebro ${cerebro}, integra lo nuevo de [${actual.id}] en [${otra.id}] y marca [${actual.id}] como obsoleta fusionada en [${otra.id}].`} aviso="Orden copiada: pégala en Claude Code">
                          Fundir en la otra
                        </Copiar>
                      )}
                      <Copiar texto={`Con la skill /cerebro: marca obsoleta la nota [${actual.id}] del cerebro ${cerebro}.`} aviso="Orden copiada: pégala en Claude Code">
                        Descartar
                      </Copiar>
                      <button
                        type="button"
                        className="boton"
                        onClick={() => {
                          setRevisando(false);
                          seleccionar(actual.id);
                        }}
                      >
                        Verla en el tejido
                      </button>
                      <span>Orbis no cambia tus notas: cada botón copia la orden para Claude Code. J y K pasan de nota.</span>
                    </footer>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
