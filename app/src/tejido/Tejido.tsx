import { useEffect, useMemo, useRef } from 'react';
import type { GrafoApi } from '../lib/api.ts';
import { pulsos, useApp } from '../lib/estado.ts';
import { COLOR_TIPO, ETIQUETA_TIPO } from '../lib/tipos.ts';
import { crearTejido, type Neurona, type Tejido as Motor } from './motor.ts';

/** El tejido vivo: ocupa toda la pantalla, detrás de los paneles */
export function Tejido({ grafo, hilo, panelAncho }: { grafo: GrafoApi; hilo: string[]; panelAncho: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const pista = useRef<HTMLDivElement>(null);
  const motor = useRef<Motor>(undefined);
  const seleccion = useApp((s) => s.seleccion);
  const soloTipo = useApp((s) => s.soloTipo);
  const enVivo = useApp((s) => s.enVivo);
  const resaltadas = useApp((s) => s.resaltadas);
  // con una neurona sacada, los paneles se apartan y el tejido usa toda la pantalla
  const sacando = useApp((s) => !!s.jalando);

  const neuronas = useMemo<Neurona[]>(() => {
    const grado = new Map<string, number>();
    for (const a of grafo.aristas) {
      if (a.clase !== 'enlace') continue;
      grado.set(a.destino, (grado.get(a.destino) ?? 0) + 1);
      grado.set(a.origen, (grado.get(a.origen) ?? 0) + 0.35);
    }
    return grafo.nodos
      .filter((n) => n.estado !== 'obsoleta')
      .map((n) => ({ id: n.id, titulo: n.titulo, tipo: n.tipo, tema: n.tema ?? 'general', grado: grado.get(n.id) ?? 0, lecturas: n.lecturas, reciente: n.estado === 'reciente', revisar: !!n.revisar || !!n.vencida }));
  }, [grafo]);
  const porId = useMemo(() => new Map(grafo.nodos.map((n) => [n.id, n])), [grafo]);
  const datos = useRef(porId);
  datos.current = porId;
  // con cuántas notas distintas se comunica cada una
  const cuentas = useMemo(() => {
    const vecinas = new Map<string, Set<string>>();
    const une = (a: string, b: string) => vecinas.set(a, (vecinas.get(a) ?? new Set<string>()).add(b));
    for (const a of grafo.aristas) {
      if (a.clase !== 'enlace' || a.origen === a.destino || porId.get(a.origen)?.estado === 'obsoleta' || porId.get(a.destino)?.estado === 'obsoleta' || !porId.has(a.origen) || !porId.has(a.destino)) continue;
      une(a.origen, a.destino);
      une(a.destino, a.origen);
    }
    return new Map([...vecinas].map(([id, v]) => [id, v.size]));
  }, [grafo, porId]);
  const conexiones = useRef(cuentas);
  conexiones.current = cuentas;

  useEffect(() => {
    if (!lienzo.current) return;
    const m = crearTejido(lienzo.current, {
      alElegir: (id) => useApp.getState().seleccionar(id),
      alJalar: (id, laCitan, citaA, camino) => useApp.getState().setJalando(id ? { id, laCitan, citaA, camino } : undefined),
      alPasar: (id, x, y, fija) => {
        const caja = pista.current;
        if (!caja) return;
        const nota = id ? datos.current.get(id) : undefined;
        if (!nota) return caja.classList.remove('ver');
        if (caja.dataset.id !== id) {
          caja.dataset.id = id;
          caja.style.setProperty('--punto', COLOR_TIPO[nota.tipo]);
          const estado = nota.estado === 'reciente' ? 'Sin revisar' : nota.revisar ? 'Cita algo que ya no existe' : nota.vencida ? 'Vencida' : '';
          (caja.children[0] as HTMLElement).textContent = [ETIQUETA_TIPO[nota.tipo], estado].filter(Boolean).join(' · ');
          (caja.children[1] as HTMLElement).textContent = nota.titulo;
          (caja.children[2] as HTMLElement).textContent = nota.descripcion;
        }
        const cuantas = conexiones.current.get(id as string) ?? 0;
        (caja.children[3] as HTMLElement).textContent = `${cuantas === 1 ? '1 conexión' : `${cuantas} conexiones`} · ${fija ? 'doble clic o Enter para sacarla' : 'arrástrala para sacarla del tejido'}`;
        caja.style.transform = fija ? `translate(${x}px, ${y}px)` : `translate(${x > innerWidth * 0.6 ? x - 338 : x + 18}px, ${Math.min(y + 20, innerHeight - 150)}px)`;
        // fija se desliza de un nombre a otro; libre va pegada al cursor
        caja.classList.toggle('fija', !!fija && caja.classList.contains('ver'));
        caja.classList.add('ver');
      },
    });
    motor.current = m;
    const dejar = pulsos.escuchar((ids) => m.pulso(ids));
    const recentrar = () => m.recentrar();
    const recoger = () => m.recoger();
    const sacar = (e: Event) => m.sacar((e as CustomEvent<string>).detail);
    // con una neurona fuera: flechas para recorrer sus notas, Enter para sacar la señalada, Retroceso para volver
    const tecla = (e: KeyboardEvent) => {
      const s = useApp.getState();
      if (!s.jalando || s.buscando || s.revisando || s.atajos || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|BUTTON|A)$/.test((e.target as HTMLElement).tagName)) return;
      if (!/^(Arrow(Up|Down|Left|Right)|Enter|Backspace)$/.test(e.key)) return;
      if (m.tecla(e.key)) e.preventDefault();
    };
    addEventListener('orbis:recentrar', recentrar);
    addEventListener('orbis:recoger', recoger);
    addEventListener('orbis:sacar', sacar);
    addEventListener('keydown', tecla);
    return () => {
      removeEventListener('orbis:recentrar', recentrar);
      removeEventListener('orbis:recoger', recoger);
      removeEventListener('orbis:sacar', sacar);
      removeEventListener('keydown', tecla);
      dejar();
      m.destruir();
    };
  }, []);

  useEffect(() => {
    const ajustar = () => {
      const estrecha = innerWidth < 1100;
      motor.current?.margenes({ izquierda: estrecha || sacando ? 0 : innerWidth < 1500 ? 290 : 360, derecha: estrecha || (sacando && !seleccion) ? 0 : panelAncho + 36, arriba: 76, abajo: estrecha ? 320 : innerHeight < 820 ? 104 : 128 });
    };
    ajustar();
    addEventListener('resize', ajustar);
    return () => removeEventListener('resize', ajustar);
  }, [panelAncho, sacando, seleccion]);
  useEffect(() => {
    const pares = grafo.aristas.filter((a) => a.clase === 'enlace').map((a) => [a.origen, a.destino] as [string, string]);
    motor.current?.datos(neuronas, pares);
  }, [neuronas, grafo]);
  useEffect(() => motor.current?.elegir(seleccion), [seleccion, neuronas]);
  useEffect(() => motor.current?.hilo(hilo), [hilo, neuronas]);
  useEffect(() => motor.current?.soloTipo(soloTipo), [soloTipo]);
  useEffect(() => motor.current?.girar(enVivo), [enVivo]);
  useEffect(() => motor.current?.resaltar(resaltadas), [resaltadas, neuronas]);

  return (
    <>
      <canvas ref={lienzo} className="tejido" role="img" aria-label="Tejido del cerebro: cada punto de luz es una nota. Arrastra el fondo para girar, o una neurona para sacarla y ver las notas con las que se comunica." />
      <div ref={pista} className="pista" role="status">
        <span />
        <b />
        <p />
        <small />
      </div>
    </>
  );
}
