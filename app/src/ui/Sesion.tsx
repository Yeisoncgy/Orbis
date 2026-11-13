import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Map as IconoMapa, Pause, PenLine, Play, Radio, Search, SearchX, Tag } from 'lucide-react';
import { useMemo } from 'react';
import { useApp } from '../lib/estado.ts';
import { hora, nombreSesion, type ClasePaso, type Sesion } from '../lib/sesiones.ts';
import { miles, MUELLE, SUAVE } from './comun.tsx';

const ICONO: Record<ClasePaso, typeof Search> = { mapa: IconoMapa, buscar: Search, falla: SearchX, leer: BookOpen, escribir: PenLine, estado: Tag };

/** El hilo de un pensamiento: qué buscó, qué leyó, dónde no encontró nada y qué escribió */
export function Hilo({ sesion, momento }: { sesion?: Sesion; momento?: number }) {
  const seleccionar = useApp((s) => s.seleccionar);
  if (!sesion) {
    return (
      <motion.aside className="panel hilo vidrio" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={MUELLE}>
        <h2>El hilo de un pensamiento</h2>
        <p className="vacio">Cuando un agente consulte este cerebro, aquí verás paso a paso qué buscó, qué leyó y qué escribió.</p>
      </motion.aside>
    );
  }
  const hasta = momento ?? Infinity;
  const vistos = sesion.pasos.filter((p) => p.ts <= hasta);
  const pasos = vistos.slice(-8);
  const desde = vistos.length - pasos.length;
  const mayor = Math.max(1, ...sesion.pasos.map((p) => p.tokens));
  const enCurso = sesion.viva && momento === undefined;
  const gastado = vistos.reduce((n, p) => n + p.tokens, 0);
  return (
    <motion.aside className="panel hilo vidrio" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={MUELLE}>
      <h2>
        {enCurso ? 'El hilo de este pensamiento' : `Sesión de las ${hora(sesion.inicio)}`}
        <span>{miles(gastado)} tokens</span>
      </h2>
      <p className="meta-sesion">
        {nombreSesion(sesion)}
        {sesion.proyecto ? ` · ${sesion.proyecto}` : ''} · {vistos.length} de {sesion.pasos.length} pasos
      </p>
      {desde > 0 && <p className="antes">{desde} pasos anteriores</p>}
      <ol>
        <AnimatePresence initial={false} mode="popLayout">
          {pasos.map((p, k) => {
            const ultimo = k === pasos.length - 1 && (enCurso || momento !== undefined);
            const Icono = ICONO[p.clase];
            return (
              <motion.li key={`${p.ts}-${desde + k}`} layout className={`${p.clase}${ultimo ? ' ahora' : ''}`} initial={{ opacity: 0, x: 24, filter: 'blur(6px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, x: -16 }} transition={MUELLE}>
                <i>
                  <Icono size={13} strokeWidth={2.2} />
                </i>
                {p.notas.length > 0 ? (
                  <button type="button" onClick={() => seleccionar(p.notas[0])}>
                    {p.titulo}
                  </button>
                ) : (
                  <b>{p.titulo}</b>
                )}
                <span>{ultimo && enCurso && p.clase === 'leer' ? 'leyendo ahora' : [p.detalle, hora(p.ts)].filter(Boolean).join(' · ')}</span>
                {p.tokens > 0 && <u style={{ width: `${Math.max(3, (p.tokens / mayor) * 58)}%` }} />}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </motion.aside>
  );
}

const TRAMOS = 96;

/** La cinta del día: cada sesión es un tramo y debajo va el pulso de la actividad. Tocar una sesión la repite paso a paso. */
export function Cinta({ sesiones, mostrada }: { sesiones: Sesion[]; mostrada?: Sesion }) {
  const { enVivo, setEnVivo, elegirSesion, momento, reproduciendo, setReproduciendo, sesion: elegida } = useApp();
  const ahora = Date.now();
  const dia = new Date(mostrada?.fin ?? ahora);
  dia.setHours(0, 0, 0, 0);
  const esHoy = dia.getTime() === new Date(ahora).setHours(0, 0, 0, 0);
  const delDia = useMemo(() => sesiones.filter((s) => s.fin >= dia.getTime() && s.inicio < dia.getTime() + 86400000), [sesiones, dia.getTime()]);
  // la cinta abarca desde la primera sesión hasta ahora, con al menos cuatro horas
  const fin = esHoy ? ahora + 12 * 60000 : Math.max(...delDia.map((s) => s.fin + 20 * 60000), dia.getTime() + 43200000);
  const inicio = Math.min(fin - 4 * 3600000, ...delDia.map((s) => s.inicio - 12 * 60000));
  const x = (t: number) => ((t - inicio) / (fin - inicio)) * 100;
  const horas: number[] = [];
  const cada = Math.max(1, Math.round((fin - inicio) / 3600000 / 7)) * 3600000;
  for (let t = Math.ceil(inicio / cada) * cada; t < fin; t += cada) horas.push(t);
  // el pulso: cuánto pidió el cerebro en cada tramo del día
  const pulso = useMemo(() => {
    const barras = Array<number>(TRAMOS).fill(0);
    for (const s of delDia) for (const p of s.pasos) barras[Math.min(TRAMOS - 1, Math.max(0, Math.floor(((p.ts - inicio) / (fin - inicio)) * TRAMOS)))] += 1 + p.tokens / 400;
    const mayor = Math.max(1, ...barras);
    return barras.map((b) => b / mayor);
  }, [delDia, inicio, fin]);
  const viva = sesiones.at(-1)?.viva;
  const repitiendo = elegida !== undefined;
  const cabezal = repitiendo ? (momento ?? mostrada?.fin ?? ahora) : ahora;

  return (
    <motion.footer className="cinta vidrio" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SUAVE, delay: 0.9 }}>
      <button
        type="button"
        className="play"
        onClick={() => {
          if (!repitiendo) return setEnVivo(!enVivo);
          if (!reproduciendo && mostrada && (momento === undefined || momento >= mostrada.fin)) return elegirSesion(mostrada.id, mostrada.inicio);
          setReproduciendo(!reproduciendo);
        }}
        aria-label={repitiendo ? (reproduciendo ? 'Pausar la repetición' : 'Repetir la sesión') : enVivo ? 'Pausar el giro' : 'Seguir en vivo'}
      >
        {(repitiendo ? reproduciendo : enVivo) ? <Pause size={20} strokeWidth={2.4} /> : <Play size={20} strokeWidth={2.4} style={{ marginLeft: 2 }} />}
      </button>
      <div className="reloj">
        {hora(cabezal)}
        <small className={repitiendo ? 'repite' : viva ? 'vivo' : ''}>{repitiendo ? (reproduciendo ? 'repitiendo' : 'en pausa') : viva ? 'en vivo' : enVivo ? 'en calma' : 'giro en pausa'}</small>
      </div>
      <div className="pista-t">
        <div className="pulso-dia" aria-hidden="true">
          {pulso.map((b, i) => (
            <i key={i} style={{ height: `${b ? 12 + b * 88 : 0}%` }} />
          ))}
        </div>
        <div className="linea" />
        {horas.map((t) => (
          <span key={t} className="hora" style={{ left: `${x(t)}%` }}>
            {hora(t)}
          </span>
        ))}
        {delDia.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`ses${s.id === mostrada?.id ? ' elegida' : ''}${s.viva ? ' viva' : ''}`}
            style={{ left: `${x(s.inicio)}%`, width: `max(16px, ${x(s.fin) - x(s.inicio)}%)` }}
            title={`${hora(s.inicio)} a ${hora(s.fin)}: ${s.pasos.length} pasos, ${miles(s.tokens)} tokens. Toca para repetirla.`}
            onClick={() => elegirSesion(s.id, s.inicio)}
          >
            {s.id === mostrada?.id && <motion.span layoutId="sesion-elegida" className="marco-ses" transition={MUELLE} />}
          </button>
        ))}
        {(esHoy || repitiendo) && <motion.div className="cabezal" animate={{ left: `${Math.min(100, Math.max(0, x(cabezal)))}%` }} transition={{ type: 'spring', stiffness: 120, damping: 22 }} />}
      </div>
      {repitiendo ? (
        <button type="button" className="volver" onClick={() => setEnVivo(true)}>
          <Radio size={15} /> Volver a en vivo
        </button>
      ) : (
        <div className="resumen">
          <b>{delDia.length}</b> {delDia.length === 1 ? 'sesión' : 'sesiones'} {esHoy ? 'hoy' : `el ${dia.toLocaleDateString('es', { day: 'numeric', month: 'short' })}`}
          <br />
          <b>{miles(delDia.reduce((n, s) => n + s.tokens, 0))}</b> tokens servidos
        </div>
      )}
    </motion.footer>
  );
}
