import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Waypoints, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, type NotaApi, type VecinoApi } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import { fechaCorta, haceCuanto } from '../lib/tiempo.ts';
import { COLOR_TIPO, SINGULAR_TIPO } from '../lib/tipos.ts';
import { contenido, Copiar, MUELLE } from './comun.tsx';

/** El vecindario de una nota: ella al centro y, alrededor, las notas con las que se comunica */
function Vecindario({ nota }: { nota: NotaApi }) {
  const seleccionar = useApp((s) => s.seleccionar);
  const [sobre, setSobre] = useState<VecinoApi & { sale: boolean }>();
  const vecinas = useMemo(() => {
    const vistas = new Set<string>();
    return [...nota.salientes.map((v) => ({ ...v, sale: true })), ...nota.entrantes.map((v) => ({ ...v, sale: false }))].filter((v) => !vistas.has(v.id) && vistas.add(v.id)).slice(0, 28);
  }, [nota]);
  if (vecinas.length === 0) return null;
  const total = nota.salientes.length + nota.entrantes.length;
  return (
    <section className="vecindario">
      <svg viewBox="-170 -92 340 184" role="group" aria-label="Notas con las que se comunica">
        {vecinas.map((v, i) => {
          const a = (i / vecinas.length) * Math.PI * 2 - Math.PI / 2, anillo = vecinas.length > 14 && i % 2 ? 0.66 : 1;
          const x = Math.cos(a) * 138 * anillo, y = Math.sin(a) * 70 * anillo;
          const activa = sobre?.id === v.id;
          return (
            <g key={v.id} className={activa ? 'activa' : ''}>
              <motion.path d={`M0 0Q${x * 0.5 - y * 0.18} ${y * 0.5 + x * 0.1} ${x} ${y}`} stroke={COLOR_TIPO[v.tipo]} initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: activa ? 0.95 : 0.34 }} transition={{ duration: 0.7, delay: 0.15 + i * 0.02 }} />
              <motion.circle
                cx={x}
                cy={y}
                r={activa ? 7 : 4.6}
                fill={COLOR_TIPO[v.tipo]}
                style={{ filter: `drop-shadow(0 0 6px ${COLOR_TIPO[v.tipo]})` }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...MUELLE, delay: 0.2 + i * 0.02 }}
                tabIndex={0}
                role="button"
                aria-label={v.titulo}
                onPointerEnter={() => setSobre(v)}
                onPointerLeave={() => setSobre(undefined)}
                onFocus={() => setSobre(v)}
                onBlur={() => setSobre(undefined)}
                onClick={() => seleccionar(v.id)}
                onKeyDown={(e) => e.key === 'Enter' && seleccionar(v.id)}
              />
            </g>
          );
        })}
        <circle r="15" className="halo" fill={COLOR_TIPO[nota.tipo]} />
        <circle r="8" fill="#E6FBFF" style={{ filter: `drop-shadow(0 0 10px ${COLOR_TIPO[nota.tipo]})` }} />
      </svg>
      <p>
        {sobre ? (
          <>
            <b style={{ color: COLOR_TIPO[sobre.tipo] }}>{sobre.titulo}</b>
            <span>{sobre.sale ? 'esta nota la enlaza' : 'enlaza a esta nota'}</span>
          </>
        ) : (
          <>
            <b>Se comunica con {total}</b>
            <span>
              enlaza a {nota.salientes.length}, la enlazan {nota.entrantes.length}
            </span>
          </>
        )}
      </p>
    </section>
  );
}

function Lista({ titulo, notas }: { titulo: string; notas: VecinoApi[] }) {
  const seleccionar = useApp((s) => s.seleccionar);
  const [todas, setTodas] = useState(false);
  if (!notas.length) return null;
  return (
    <section className="vecinas">
      <h3>
        {titulo} <span>{notas.length}</span>
      </h3>
      <ul>
        {(todas ? notas : notas.slice(0, 8)).map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => seleccionar(v.id)}>
              <i style={{ background: COLOR_TIPO[v.tipo], color: COLOR_TIPO[v.tipo] }} />
              {v.titulo}
            </button>
          </li>
        ))}
      </ul>
      {notas.length > 8 && !todas && (
        <button type="button" className="mas" onClick={() => setTodas(true)}>
          Ver las {notas.length - 8} que faltan
        </button>
      )}
    </section>
  );
}

export function Nota({ cerebro, id }: { cerebro: string; id: string }) {
  const seleccionar = useApp((s) => s.seleccionar);
  const { data: nota, error } = useQuery({ queryKey: ['nota', cerebro, id], queryFn: () => api.nota(cerebro, id), placeholderData: (p) => p });
  const html = useMemo(() => (nota ? contenido(nota) : ''), [nota]);
  const color = nota ? COLOR_TIPO[nota.tipo] : '#7CFFE1';
  const avisos: string[] = [];
  if (nota?.fusionadaEn) avisos.push(`Se fusionó en otra nota: ${nota.fusionadaEn}.`);
  else if (nota?.estado === 'obsoleta') avisos.push('Retirada: se conserva como historia.');
  if (nota?.estado === 'reciente') avisos.push('Sin revisar: la escribió un agente y nadie la ha consolidado.');
  if (nota?.vencida) avisos.push(`Vencida desde el ${fechaCorta(nota.validoHasta ?? '')}.`);
  if (nota?.revisar) avisos.push(`Por revisar: ${nota.revisar}`);

  return (
    <motion.aside className="panel nota vidrio" style={{ '--punto': color } as React.CSSProperties} initial={{ opacity: 0, x: 60, filter: 'blur(10px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: 40, filter: 'blur(8px)' }} transition={MUELLE}>
      <button type="button" className="cerrar" onClick={() => seleccionar(undefined)} aria-label="Cerrar la nota">
        <X size={18} />
      </button>
      {error && <p className="vacio">No se pudo abrir la nota: {error.message}</p>}
      {nota && (
        <motion.div key={nota.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <p className="clase">
            <i style={{ background: color, color }} />
            {SINGULAR_TIPO[nota.tipo]}
            {nota.tema ? ` de ${nota.tema.replace(/-/g, ' ')}` : ''}
            <em className={nota.estado}>{nota.estado === 'reciente' ? 'sin revisar' : nota.estado === 'obsoleta' ? 'retirada' : 'consolidada'}</em>
          </p>
          <h2>{nota.titulo}</h2>
          <p className="resumen-n">{nota.descripcion}</p>
          {avisos.map((a) => (
            <p key={a} className="alerta">
              {a}
            </p>
          ))}
          <div className="cifras">
            <div>
              <b>{nota.lecturas}</b>
              <span>{nota.lecturas === 1 ? 'lectura' : 'lecturas'}</span>
            </div>
            <div>
              <b>{nota.salientes.length + nota.entrantes.length}</b>
              <span>conexiones</span>
            </div>
            <div>
              <b>{fechaCorta(nota.verificado ?? nota.actualizado).replace(/ de /g, ' ').replace(/ \d{4}$/, '')}</b>
              <span>verificada</span>
            </div>
          </div>
          <Vecindario nota={nota} />
          <div
            className="texto"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={(e) => {
              const destino = (e.target as HTMLElement).closest<HTMLElement>('[data-nota]')?.dataset.nota;
              if (destino) seleccionar(destino);
            }}
          />
          <dl>
            {nota.ultimaLectura && (
              <div>
                <dt>Última lectura</dt>
                <dd>{haceCuanto(nota.ultimaLectura)}</dd>
              </div>
            )}
            {nota.origen && (
              <div>
                <dt>La escribió</dt>
                <dd>{nota.origen === 'importacion' ? 'una importación' : `un ${nota.origen}`}</dd>
              </div>
            )}
            {nota.fuente?.length ? (
              <div>
                <dt>Fuente</dt>
                <dd className="rutas">{nota.fuente.join('\n')}</dd>
              </div>
            ) : null}
            {nota.alias?.length ? (
              <div>
                <dt>También se busca como</dt>
                <dd>{nota.alias.join(', ')}</dd>
              </div>
            ) : null}
          </dl>
          <Lista titulo="Enlaza a" notas={nota.salientes} />
          <Lista titulo="La enlazan" notas={nota.entrantes} />
          <div className="acciones">
            <button type="button" className="boton fuerte" onClick={() => dispatchEvent(new CustomEvent('orbis:sacar', { detail: nota.id }))}>
              <Waypoints size={15} strokeWidth={2.2} /> Sacarla del tejido
            </button>
            <Copiar texto={`[[${nota.id}]]`} aviso="Enlace copiado">
              Copiar enlace
            </Copiar>
            <Copiar texto={`Con la skill /cerebro: lee la nota [${nota.id}] del cerebro ${cerebro}.`} aviso="Orden copiada: pégala en Claude Code">
              Pedirle a Claude que la lea
            </Copiar>
          </div>
        </motion.div>
      )}
    </motion.aside>
  );
}
