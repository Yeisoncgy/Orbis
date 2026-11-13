// Piezas flotantes alrededor del grafo: cifras, filtros por tipo, señales en vivo y controles
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Archive, BookOpen, Check, Copy, FilePen, List as ListaIcono, Map as MapaIcono, Maximize2, Orbit, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { accionesGrafo } from '../grafo/Grafo3D.tsx';
import { api, type EventoApi, type GrafoApi } from '../lib/api.ts';
import { useApp } from '../lib/estado.ts';
import type { Conexion } from '../lib/eventos.ts';
import { fechaCorta, haceCuanto } from '../lib/tiempo.ts';
import { COLOR_TIPO, ETIQUETA_ACCION, ETIQUETA_TIPO, ORDEN_TIPOS } from '../lib/tipos.ts';

const numero = new Intl.NumberFormat('es');

export function Cifras({ grafo, conexion }: { grafo?: GrafoApi; conexion: Conexion }) {
  const c = useMemo(() => {
    if (!grafo) return undefined;
    const vivas = grafo.nodos.filter((n) => n.estado !== 'obsoleta');
    return {
      notas: vivas.length,
      conexiones: grafo.aristas.filter((a) => a.clase === 'enlace').length,
    };
  }, [grafo]);
  const items: [string, number | undefined][] = [
    ['notas', c?.notas],
    ['conexiones', c?.conexiones],
  ];
  return (
    <div className="vidrio flex h-11 items-center gap-5 rounded-full pl-4 pr-5">
      <span className="flex items-center gap-2" title={conexion === 'en-vivo' ? 'Viendo la actividad de los agentes en vivo' : 'Sin conexión con el servidor local'}>
        <span className={`size-2 rounded-full ${conexion === 'en-vivo' ? 'punto-vivo bg-primario' : conexion === 'conectando' ? 'bg-[#D5DBE3]' : 'bg-[#F59E0B]'}`} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy">{conexion === 'en-vivo' ? 'En vivo' : conexion === 'conectando' ? 'Conectando' : 'Sin conexión'}</span>
      </span>
      <span className="h-4 w-px bg-borde" />
      {items.map(([etiqueta, valor]) => (
        <span key={etiqueta} className="flex items-baseline gap-1.5">
          <span className="font-mono text-[13px] font-medium tabular-nums text-navy">{valor === undefined ? '–' : numero.format(valor)}</span>
          <span className="text-[11px] text-secundario">{etiqueta}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Salud del cerebro: notas recientes sin consolidar, notas sin ningún enlace y enlaces rotos. Solo avisa
 * (la app no escribe): el botón copia el comando para pegarlo en Claude Code.
 */
export function Salud({ cerebro, grafo }: { cerebro: string; grafo: GrafoApi }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const seleccionar = useApp((s) => s.seleccionar);
  const salud = useMemo(() => {
    const vivas = grafo.nodos.filter((n) => n.estado !== 'obsoleta');
    const conEnlace = new Set<string>();
    for (const a of grafo.aristas) {
      if (a.clase !== 'enlace') continue;
      conEnlace.add(a.origen);
      conEnlace.add(a.destino);
    }
    return {
      recientes: vivas.filter((n) => n.estado === 'reciente').length,
      sueltas: vivas.filter((n) => !conEnlace.has(n.id)),
      rotos: grafo.rotos,
    };
  }, [grafo]);
  const pendientes = salud.recientes + salud.sueltas.length + salud.rotos;
  if (pendientes === 0) return null;

  const comando = `/cerebro consolidar ${cerebro}`;
  const copiar = () => {
    void navigator.clipboard?.writeText(comando).then(
      () => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      },
      () => undefined,
    );
  };
  const filas: [string, number, string][] = [
    ['recientes sin consolidar', salud.recientes, 'Las escribió un agente y nadie las ha revisado'],
    ['sin ningún enlace', salud.sueltas.length, 'Nadie las conecta: cuelgan de su tipo'],
    ['enlaces rotos', salud.rotos, 'Apuntan a una nota que no existe'],
  ];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="vidrio flex h-11 items-center gap-2.5 rounded-full pl-4 pr-5 text-[12px] font-semibold text-navy transition-transform duration-200 hover:-translate-y-px"
      >
        <span className="size-2 rounded-full bg-[#F59E0B]" />
        {salud.recientes > 0 ? `${salud.recientes} por consolidar` : `${pendientes} por revisar`}
      </button>
      <AnimatePresence>
        {abierto && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="vidrio absolute bottom-14 right-0 w-[320px] rounded-2xl p-4"
          >
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy">Salud del cerebro</p>
            <ul className="mt-3 space-y-2.5">
              {filas.map(([etiqueta, cuantas, ayuda]) => (
                <li key={etiqueta} className={cuantas === 0 ? 'opacity-40' : ''} title={ayuda}>
                  <span className="font-mono text-[15px] font-medium tabular-nums text-navy">{cuantas}</span>{' '}
                  <span className="text-[12px] text-cuerpo">{etiqueta}</span>
                </li>
              ))}
            </ul>
            {salud.sueltas.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-borde pt-3">
                {salud.sueltas.slice(0, 6).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => seleccionar(n.id)}
                    className="max-w-full truncate rounded-full bg-white px-2.5 py-1 text-[11px] text-cuerpo hover:text-navy"
                  >
                    {n.titulo}
                  </button>
                ))}
                {salud.sueltas.length > 6 && <span className="px-1 py-1 text-[11px] text-secundario">y {salud.sueltas.length - 6} más</span>}
              </div>
            )}
            <button
              type="button"
              onClick={copiar}
              className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-full bg-navy text-[12px] font-semibold text-white transition-colors hover:bg-[#16283d]"
            >
              {copiado ? <Check className="size-3.5" strokeWidth={1.5} /> : <Copy className="size-3.5" strokeWidth={1.5} />}
              {copiado ? 'Copiado: pégalo en Claude Code' : 'Copiar /cerebro consolidar'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Filtros({ grafo }: { grafo: GrafoApi }) {
  const ocultos = useApp((s) => s.tiposOcultos);
  const alternar = useApp((s) => s.alternarTipo);
  const soloTipo = useApp((s) => s.soloTipo);
  const obsoletas = useApp((s) => s.obsoletas);
  const conteo = useMemo(() => {
    const c = new Map<string, number>();
    for (const n of grafo.nodos) if (obsoletas || n.estado !== 'obsoleta') c.set(n.tipo, (c.get(n.tipo) ?? 0) + 1);
    return c;
  }, [grafo, obsoletas]);

  return (
    <div className="vidrio flex items-center gap-1 rounded-full p-1">
      {ORDEN_TIPOS.filter((t) => conteo.has(t)).map((t) => {
        const oculto = ocultos.has(t);
        return (
          <button
            key={t}
            type="button"
            onClick={() => alternar(t)}
            onDoubleClick={() => soloTipo(t)}
            title="Clic: mostrar u ocultar · doble clic: ver solo este tipo"
            aria-pressed={!oculto}
            className={`group flex h-8 items-center gap-2 rounded-full px-3 text-[12px] font-semibold transition-all duration-200 ${oculto ? 'text-secundario/70' : 'text-navy hover:bg-white'}`}
          >
            <span
              className="size-2.5 rounded-full transition-all duration-300"
              style={{
                background: oculto ? 'transparent' : COLOR_TIPO[t],
                boxShadow: oculto ? `inset 0 0 0 1.5px ${COLOR_TIPO[t]}88` : `0 0 0 3px ${COLOR_TIPO[t]}22, 0 0 10px ${COLOR_TIPO[t]}66`,
              }}
            />
            {ETIQUETA_TIPO[t]}
            <span className="font-mono text-[10.5px] font-normal text-secundario">{conteo.get(t)}</span>
          </button>
        );
      })}
    </div>
  );
}

const ICONO = { mapa: MapaIcono, leer: BookOpen, buscar: Search, escribir: FilePen, estado: RefreshCw } as const;
const TINTE: Record<string, string> = { leer: '#C81E1E', buscar: '#0EA5E9', escribir: '#10B981', estado: '#F59E0B', mapa: '#3D5AFE' };

function useAhora(cadaMs: number): number {
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cadaMs);
    return () => clearInterval(t);
  }, [cadaMs]);
  return ahora;
}

export function Senales({ cerebro, grafo }: { cerebro: string; grafo?: GrafoApi }) {
  const seleccionar = useApp((s) => s.seleccionar);
  const ahora = useAhora(15000);
  const { data: eventos = [] } = useQuery({ queryKey: ['actividad', cerebro], queryFn: () => api.actividad(cerebro), staleTime: Infinity });
  const titulos = useMemo(() => new Map((grafo?.nodos ?? []).map((n) => [n.id, n.titulo])), [grafo]);
  // plegadas muestran solo la última señal; con el mouse encima (o foco) se abren las 4 últimas
  const [abierta, setAbierta] = useState(false);
  const visibles = eventos.slice(0, abierta ? 4 : 1);

  return (
    <div
      className="w-[300px]"
      onMouseEnter={() => setAbierta(true)}
      onMouseLeave={() => setAbierta(false)}
      onFocus={() => setAbierta(true)}
      onBlur={() => setAbierta(false)}
    >
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy">Señales de agentes</span>
        <span className="h-px flex-1 bg-gradient-to-r from-borde to-transparent" />
      </div>
      {visibles.length === 0 ? (
        <p className="vidrio rounded-2xl px-3.5 py-3 text-[12px] leading-relaxed text-secundario">
          Aún no hay señales. Cuando un agente lea o escriba aquí, la neurona se encenderá.
        </p>
      ) : (
        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {visibles.map((e: EventoApi, i) => {
              const Icono = ICONO[e.accion] ?? BookOpen;
              const notas = e.notas.filter((id) => titulos.has(id));
              return (
                <motion.li
                  key={`${e.ts}-${e.pid}-${e.accion}`}
                  layout
                  initial={{ opacity: 0, x: -14, scale: 0.97 }}
                  animate={{ opacity: 1 - i * 0.16, x: 0, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <button
                    type="button"
                    disabled={notas.length === 0}
                    onClick={() => notas[0] && seleccionar(notas[0])}
                    className="vidrio flex w-full items-center gap-2.5 rounded-2xl py-2 pl-2 pr-3 text-left transition-transform duration-200 enabled:hover:-translate-y-px"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-xl" style={{ background: `${TINTE[e.accion]}14`, color: TINTE[e.accion] }}>
                      <Icono className="size-3.5" strokeWidth={1.5} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-cuerpo">
                      {ETIQUETA_ACCION[e.accion]}{' '}
                      {e.accion === 'buscar'
                        ? notas.length > 0 && <span className="text-secundario">y encontró {notas.length}</span>
                        : notas.length > 0 && (
                            <>
                              <span className="font-semibold text-navy">{titulos.get(notas[0])}</span>
                              {notas.length > 1 && <span className="text-secundario"> y {notas.length - 1} más</span>}
                            </>
                          )}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-secundario">{haceCuanto(e.ts, ahora)}</span>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function Control({ etiqueta, activo, onClick, children }: { etiqueta: string; activo?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={etiqueta}
      aria-label={etiqueta}
      aria-pressed={activo}
      className={`flex size-9 items-center justify-center rounded-full transition-all duration-200 ${activo ? 'bg-navy text-white shadow-[0_6px_16px_-6px_rgb(12_25_41/0.55)]' : 'text-cuerpo hover:bg-white hover:text-navy'}`}
    >
      {children}
    </button>
  );
}

/** Todas las notas en una lista (lo más reciente arriba): leer y buscar sin navegar en 3D */
export function ListaNotas({ grafo }: { grafo: GrafoApi }) {
  const seleccion = useApp((s) => s.seleccion);
  const seleccionar = useApp((s) => s.seleccionar);
  const setHover = useApp((s) => s.setHover);
  const ocultos = useApp((s) => s.tiposOcultos);
  const obsoletas = useApp((s) => s.obsoletas);
  const filas = useMemo(() => {
    const enlaces = new Map<string, number>();
    for (const a of grafo.aristas) {
      if (a.clase !== 'enlace') continue;
      enlaces.set(a.origen, (enlaces.get(a.origen) ?? 0) + 1);
      enlaces.set(a.destino, (enlaces.get(a.destino) ?? 0) + 1);
    }
    return grafo.nodos
      .filter((n) => (obsoletas || n.estado !== 'obsoleta') && !ocultos.has(n.tipo))
      .map((n) => ({ ...n, enlaces: enlaces.get(n.id) ?? 0 }))
      .sort((a, b) => b.actualizado.localeCompare(a.actualizado) || a.titulo.localeCompare(b.titulo));
  }, [grafo, ocultos, obsoletas]);

  return (
    <div className="vidrio flex h-full w-[300px] flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-navy">Notas</span>
        <span className="font-mono text-[10.5px] text-secundario">{filas.length}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2" onMouseLeave={() => setHover(undefined)}>
        {filas.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => seleccionar(n.id)}
              onMouseEnter={() => setHover(n.id)}
              onFocus={() => setHover(n.id)}
              onBlur={() => setHover(undefined)}
              aria-current={seleccion === n.id}
              className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${seleccion === n.id ? 'bg-white shadow-sm' : 'hover:bg-white/70'}`}
            >
              <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: COLOR_TIPO[n.tipo] }} title={ETIQUETA_TIPO[n.tipo]} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold leading-snug text-navy">{n.titulo}</span>
                <span className="mt-0.5 flex items-center gap-2 text-[10.5px] text-secundario">
                  <span>{fechaCorta(n.actualizado)}</span>
                  <span className="font-mono">{n.enlaces} {n.enlaces === 1 ? 'enlace' : 'enlaces'}</span>
                  {n.estado === 'reciente' && <span className="rounded-full bg-[#FBEAEA] px-1.5 text-primario">reciente</span>}
                  {n.estado === 'obsoleta' && <span className="rounded-full bg-[#EEF1F5] px-1.5">obsoleta</span>}
                </span>
              </span>
            </button>
          </li>
        ))}
        {filas.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-secundario">No hay notas con estos filtros.</li>}
      </ul>
    </div>
  );
}

export function Controles() {
  const rotacion = useApp((s) => s.rotacion);
  const setRotacion = useApp((s) => s.setRotacion);
  const obsoletas = useApp((s) => s.obsoletas);
  const setObsoletas = useApp((s) => s.setObsoletas);
  const lista = useApp((s) => s.lista);
  const setLista = useApp((s) => s.setLista);
  return (
    <div className="vidrio flex items-center gap-0.5 rounded-full p-1">
      <Control etiqueta="Ver las notas en lista" activo={lista} onClick={() => setLista(!lista)}>
        <ListaIcono className="size-4" strokeWidth={1.5} />
      </Control>
      <Control etiqueta="Encuadrar todo" onClick={() => accionesGrafo.encuadrar()}>
        <Maximize2 className="size-4" strokeWidth={1.5} />
      </Control>
      <Control etiqueta="Rotación lenta" activo={rotacion} onClick={() => setRotacion(!rotacion)}>
        <Orbit className="size-4" strokeWidth={1.5} />
      </Control>
      <Control etiqueta="Mostrar notas obsoletas" activo={obsoletas} onClick={() => setObsoletas(!obsoletas)}>
        <Archive className="size-4" strokeWidth={1.5} />
      </Control>
    </div>
  );
}
