import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CircleHelp, Hand, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CerebroApi, GrafoApi, SaludApi } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import type { Conexion } from '../lib/eventos.ts';
import { hora, type Sesion } from '../lib/sesiones.ts';
import { haceCuanto } from '../lib/tiempo.ts';
import { COLOR_TIPO, ETIQUETA_TIPO, ORDEN_TIPOS } from '../lib/tipos.ts';
import { Anillo, Conteo, miles, MUELLE, SUAVE } from './comun.tsx';
import { Marca } from './Marca.tsx';

function Cerebros({ cerebros, actual }: { cerebros: CerebroApi[]; actual: string }) {
  const elegir = useApp((s) => s.elegirCerebro);
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => !caja.current?.contains(e.target as Node) && setAbierto(false);
    addEventListener('pointerdown', fuera);
    return () => removeEventListener('pointerdown', fuera);
  }, [abierto]);
  return (
    <div className="cerebros" ref={caja}>
      <button type="button" className="cerebro-actual" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        {actual}
        <ChevronDown size={15} style={{ transform: abierto ? 'rotate(180deg)' : undefined }} />
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.ul className="lista-cerebros vidrio" initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={MUELLE}>
            {cerebros.map((c) => (
              <li key={c.nombre}>
                <button
                  type="button"
                  className={c.nombre === actual ? 'aqui' : ''}
                  onClick={() => {
                    elegir(c.nombre);
                    setAbierto(false);
                  }}
                >
                  <b>
                    {c.nombre}
                    {c.personal && <em>personal</em>}
                  </b>
                  <span>{c.descripcion}</span>
                  <small>
                    {miles(c.notas)} notas{c.recientes ? ` · ${c.recientes} sin revisar` : ''}
                  </small>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Barra({ cerebros, cerebro, recientes, conexion, viva }: { cerebros: CerebroApi[]; cerebro: string; recientes: number; conexion: Conexion; viva: boolean }) {
  const { setBuscando, setRevisando, setAtajos } = useApp();
  return (
    <motion.nav className="arriba" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SUAVE, delay: 0.2 }}>
      <span className="marca" role="img" aria-label="Orbis">
        <Marca lado={30} viva={viva} />
        <span aria-hidden="true">rbis</span>
      </span>
      <Cerebros cerebros={cerebros} actual={cerebro} />
      <button type="button" className="lupa vidrio" onClick={() => setBuscando(true)}>
        <Search size={17} />
        <span>Busca en {cerebro}</span>
        <kbd>/</kbd>
      </button>
      <span className={`senal ${conexion === 'sin-conexion' ? 'caida' : viva ? 'viva' : ''}`}>
        <i />
        {conexion === 'sin-conexion' ? 'Sin conexión' : viva ? 'Un agente está pensando' : 'En calma'}
      </span>
      <button type="button" className={`nuevo${recientes ? '' : ' nada'}`} onClick={() => setRevisando(true)}>
        Revisar lo nuevo
        <b>{recientes}</b>
      </button>
      <button type="button" className="redondo" onClick={() => setAtajos(true)} aria-label="Atajos y ayuda">
        <CircleHelp size={18} />
      </button>
    </motion.nav>
  );
}

/** Lo que dice el titular: el cerebro piensa, descansa o nadie lo ha usado todavía */
export function Titular({ cerebro, sesion }: { cerebro: string; sesion?: Sesion }) {
  const viva = !!sesion?.viva;
  const palabra = !sesion ? 'en silencio' : viva ? 'pensando' : 'en calma';
  let frase = 'Ningún agente lo ha consultado todavía. Cuando uno lo haga, lo verás pensar aquí.';
  if (sesion) {
    const leidas = new Set(sesion.pasos.filter((p) => p.clase === 'leer').flatMap((p) => p.notas)).size;
    const escritas = sesion.pasos.filter((p) => p.clase === 'escribir').length;
    const fallas = sesion.pasos.filter((p) => p.clase === 'falla').length;
    const minutos = Math.max(1, Math.round((Date.now() - sesion.inicio) / 60000));
    const hechos = [`leyó ${leidas} ${leidas === 1 ? 'nota' : 'notas'}`, escritas ? `escribió ${escritas}` : '', fallas ? `${fallas === 1 ? 'una búsqueda no encontró' : `${fallas} búsquedas no encontraron`} nada` : ''].filter(Boolean);
    frase = viva
      ? `Una sesión lleva ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}: ${hechos.join(', ')}.`
      : `La sesión de las ${hora(sesion.inicio)}, ${haceCuanto(new Date(sesion.fin).toISOString())}, ${hechos.join(', ')}.`;
  }
  return (
    <header className="titular">
      <motion.h1 initial={{ opacity: 0, y: 24, filter: 'blur(12px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}>
        {cerebro} está{' '}
        <AnimatePresence mode="wait">
          <motion.i key={palabra} initial={{ opacity: 0, y: 14, filter: 'blur(8px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -12, filter: 'blur(8px)' }} transition={SUAVE} className={viva ? 'viva' : ''}>
            {palabra}
          </motion.i>
        </AnimatePresence>
      </motion.h1>
      <motion.p key={frase} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.9 }}>
        {frase}
      </motion.p>
    </header>
  );
}

/** Signos vitales y composición: cuánto cuesta el cerebro, cuánto está revisado y cuánto se usa */
export function Vitales({ salud, grafo }: { salud?: SaludApi; grafo: GrafoApi }) {
  const { soloTipo, alternarTipo, resaltar, motivoResalte } = useApp();
  const [vacias, setVacias] = useState(false);
  const vivas = grafo.nodos.filter((n) => n.estado !== 'obsoleta');
  const cuenta = ORDEN_TIPOS.map((t) => vivas.filter((n) => n.tipo === t).length);
  const total = Math.max(1, vivas.length);
  const dudosas = vivas.filter((n) => n.revisar || n.vencida).map((n) => n.id);
  const mapa = salud ? salud.mapaTokens / salud.presupuesto : 0;
  const viendoDudosas = motivoResalte === 'dudosas';

  return (
    <motion.section className="vitales vidrio" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={{ ...SUAVE, delay: 0.7 }}>
      {salud && (
        <div className="anillos">
          <Anillo fraccion={mapa} color={mapa > 0.92 ? '#FFC46B' : '#7CFFE1'}>
            <b>
              <Conteo valor={Math.round(mapa * 100)} />%
            </b>
            <span>mapa</span>
          </Anillo>
          <Anillo fraccion={salud.consolidadas / Math.max(1, salud.vivas)} color="#5AB0FF">
            <b>
              <Conteo valor={Math.round((salud.consolidadas / Math.max(1, salud.vivas)) * 100)} />%
            </b>
            <span>revisado</span>
          </Anillo>
          <Anillo fraccion={salud.leidas / Math.max(1, salud.vivas)} color="#C3B8FF">
            <b>
              <Conteo valor={Math.round((salud.leidas / Math.max(1, salud.vivas)) * 100)} />%
            </b>
            <span>en uso</span>
          </Anillo>
        </div>
      )}
      {salud && (
        <p className="mapa-costo">
          El mapa que carga cada sesión pesa <b>{miles(salud.mapaTokens)}</b> de {miles(salud.presupuesto)} tokens.
        </p>
      )}
      <div className="composicion" role="group" aria-label="Tipos de nota">
        <div className="barra-tipos">
          {ORDEN_TIPOS.map((t, i) =>
            cuenta[i] ? (
              <motion.button
                key={t}
                type="button"
                title={`${ETIQUETA_TIPO[t]}: ${cuenta[i]}`}
                aria-label={`Ver solo ${ETIQUETA_TIPO[t]}`}
                className={soloTipo && soloTipo !== t ? 'apagado' : ''}
                style={{ background: COLOR_TIPO[t], flexGrow: cuenta[i] / total, color: COLOR_TIPO[t] }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ ...SUAVE, delay: 0.9 + i * 0.05 }}
                onClick={() => alternarTipo(t)}
              />
            ) : null,
          )}
        </div>
        <ul>
          {ORDEN_TIPOS.map((t, i) => (
            <li key={t}>
              <button type="button" className={soloTipo && soloTipo !== t ? 'apagado' : soloTipo === t ? 'solo' : ''} onClick={() => alternarTipo(t)} style={{ color: COLOR_TIPO[t] }}>
                <i />
                <span>{ETIQUETA_TIPO[t]}</span>
                <em>{cuenta[i]}</em>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {(dudosas.length > 0 || (salud?.sinResultado.length ?? 0) > 0) && (
        <div className="alertas">
          {dudosas.length > 0 && (
            <button type="button" className={viendoDudosas ? 'activa' : ''} onClick={() => resaltar(viendoDudosas ? [] : dudosas, 'dudosas')}>
              <b>{dudosas.length}</b>
              <span>{viendoDudosas ? 'Encendidas en el tejido. Toca para apagar.' : 'citan algo que ya no existe. Toca para verlas.'}</span>
            </button>
          )}
          {salud && salud.sinResultado.length > 0 && (
            <button type="button" className={vacias ? 'activa' : ''} onClick={() => setVacias(!vacias)}>
              <b>{salud.sinResultado.length}</b>
              <span>búsquedas no encontraron nada</span>
            </button>
          )}
          <AnimatePresence>
            {vacias && salud && (
              <motion.ul className="vacias" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SUAVE}>
                {salud.sinResultado.map((v) => (
                  <li key={v.consulta}>
                    «{v.consulta}» <small>{haceCuanto(v.ts)}</small>
                  </li>
                ))}
                <li className="consejo">Cada una es una nota que falta, o un alias por poner.</li>
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.section>
  );
}

/** Avisos breves: lo que acaba de hacer un agente y la confirmación de cada copia */
/** El camino: las neuronas por las que se ha pasado al ir sacando una tras otra, y cómo seguir con el teclado */
export function Camino({ titulo }: { titulo: (id: string) => string }) {
  const jalando = useApp((s) => s.jalando);
  const ir = (id: string) => dispatchEvent(new CustomEvent('orbis:sacar', { detail: id }));
  const pasos = jalando?.camino ?? [];
  const visibles = pasos.slice(-4);
  return (
    <AnimatePresence>
      {jalando && pasos.length > 1 && (
        <motion.nav key="camino" className="camino" aria-label="Camino recorrido" initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={MUELLE}>
          <ol>
            {pasos.length > visibles.length && <li className="antes">{pasos.length - visibles.length} antes</li>}
            <AnimatePresence initial={false} mode="popLayout">
              {visibles.map((id, n) => (
                <motion.li key={id} layout initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={MUELLE}>
                  {n === visibles.length - 1 ? (
                    <b aria-current="step">{titulo(id)}</b>
                  ) : (
                    <button type="button" onClick={() => ir(id)} title="Volver a esta neurona">
                      {titulo(id)}
                    </button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
          <p>
            <kbd>↑</kbd>
            <kbd>↓</kbd> recorrer <kbd>Enter</kbd> sacar la señalada <kbd>⌫</kbd> volver
          </p>
        </motion.nav>
      )}
    </AnimatePresence>
  );
}

export function Avisos({ titulo }: { titulo: (id: string) => string }) {
  const { avisos, jalando, resaltadas, motivoResalte, resaltar } = useApp();
  // el consejo de sacar una neurona se muestra hasta la primera vez que se hace
  const [sabe, setSabe] = useState(() => {
    try {
      return localStorage.getItem('orbis-saco') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!jalando || sabe) return;
    setSabe(true);
    try {
      localStorage.setItem('orbis-saco', '1');
    } catch {
      // sin almacenamiento, el consejo vuelve a salir la próxima vez
    }
  }, [jalando, sabe]);
  return (
    <div className="avisos">
      <AnimatePresence>
        {!sabe && !jalando && motivoResalte !== 'dudosas' && avisos.length === 0 && (
          <motion.div key="consejo" className="aviso consejo-jalar" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { ...MUELLE, delay: 3.4 } }} exit={{ opacity: 0, y: 10, transition: { duration: 0.18 } }}>
            <Hand size={16} strokeWidth={1.8} />
            Agarra una neurona y sácala del tejido: salen sus notas
          </motion.div>
        )}
        {jalando && (
          <motion.div key="jalando" className="aviso jalando" layout initial={{ opacity: 0, y: 16, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.96 }} transition={MUELLE}>
            {jalando.laCitan + jalando.citaA === 0 ? (
              <span>
                <b>{titulo(jalando.id)}</b> no se comunica con ninguna nota
              </span>
            ) : (
              <span>
                A <b>{titulo(jalando.id)}</b> la citan <b>{jalando.laCitan}</b> y ella cita a <b>{jalando.citaA}</b>
              </span>
            )}
            <button type="button" className="recoger" onClick={() => dispatchEvent(new Event('orbis:recoger'))}>
              Recoger <kbd>Esc</kbd>
            </button>
          </motion.div>
        )}
        {!jalando && motivoResalte === 'dudosas' && (
          <motion.div key="dudosas" className="aviso" layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={MUELLE}>
            {resaltadas.length} notas encendidas: citan archivos que ya no existen
            <button type="button" onClick={() => resaltar([])} aria-label="Apagar">
              <X size={14} />
            </button>
          </motion.div>
        )}
        {avisos.map((a) => (
          <motion.div key={a.id} className={`aviso ${a.clase}`} layout initial={{ opacity: 0, y: 16, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.96 }} transition={MUELLE}>
            {a.clase === 'vivo' && <i />}
            {a.texto}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const ATAJOS: [string, string][] = [
  ['Arrastrar una neurona', 'La sacas del tejido y salen sus notas: quién la cita y a quién cita'],
  ['Doble clic en una neurona', 'La saca sin arrastrarla; sobre una nota que ya salió, sigue el camino por ella'],
  ['↑ ↓ ← →  y  Enter', 'Con una neurona fuera: recorre sus notas y saca la señalada'],
  ['Retroceso', 'Vuelve a la neurona anterior del camino'],
  ['Rueda sobre las notas', 'Si no caben todas, muestra las demás'],
  ['Arrastrar el fondo', 'Gira el tejido'],
  ['Rueda', 'Acerca o aleja'],
  ['Clic en una neurona', 'Abre la nota y enciende sus conexiones'],
  ['Doble clic en el fondo', 'Vuelve a la vista completa'],
  ['/  o  Ctrl K', 'Buscar'],
  ['R', 'Revisar lo nuevo'],
  ['Espacio', 'Pausar o seguir en vivo'],
  ['Esc', 'Cerrar lo que esté abierto o recoger la neurona sacada'],
];

export function Atajos() {
  const { atajos, setAtajos } = useApp();
  return (
    <AnimatePresence>
      {atajos && (
        <motion.div className="velo" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setAtajos(false)}>
          <motion.div className="atajos vidrio" role="dialog" aria-label="Cómo moverse" initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} transition={MUELLE} onClick={(e) => e.stopPropagation()}>
            <h2>Cómo moverse</h2>
            <dl>
              {ATAJOS.map(([tecla, que]) => (
                <div key={tecla}>
                  <dt>{tecla}</dt>
                  <dd>{que}</dd>
                </div>
              ))}
            </dl>
            <p>Orbis solo mira: no cambia tus notas. Cada decisión copia una orden para pegarla en Claude Code.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
