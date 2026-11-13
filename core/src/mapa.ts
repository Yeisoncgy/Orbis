// El mapa es lo primero que lee un agente y se paga en cada sesión: tiene un presupuesto de tokens.
// Si el cerebro entero cabe, se lista entero. Si no, el mapa raíz es un índice por temas y cada tema se abre aparte.
import { ErrorNota, slug, tokensDe, vencida } from './nota.ts';
import { NOMBRE_TIPO, TIPOS, type Grafo, type MetaCerebro, type Nota, type Tipo, type Uso } from './tipos.ts';

export const PRESUPUESTO_MAPA = 3000;

function marcas(nota: Nota): string {
  const m: string[] = [];
  if (nota.estado === 'reciente') m.push('reciente');
  if (vencida(nota)) m.push('vencida');
  if (nota.revisar) m.push('revisar');
  return m.length ? ` (${m.join(', ')})` : '';
}

// el id ya es el título en slug: repetir el título duplicaría el costo del mapa
function linea(nota: Nota): string {
  return `- [${nota.id}] ${nota.descripcion}${marcas(nota)}`;
}

/** El tema de una nota es su primera etiqueta; sin etiquetas cae en «general» */
export function temaDe(nota: Nota): string {
  return slug(nota.tags[0] ?? '') || 'general';
}

function cabecera(meta: MetaCerebro, grafo: Grafo): { lineas: string[]; vivas: Nota[] } {
  const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta');
  const recientes = vivas.filter((n) => n.estado === 'reciente').length;
  const obsoletas = grafo.notas.size - vivas.length;
  return {
    vivas,
    lineas: [
      `# Cerebro ${meta.nombre}${meta.personal ? ' (personal)' : ''}`,
      meta.descripcion,
      `${vivas.length} notas · ${recientes} recientes sin consolidar${obsoletas ? ` · ${obsoletas} obsoletas ocultas` : ''}`,
    ],
  };
}

function mapaCompleto(meta: MetaCerebro, grafo: Grafo, errores: string[], uso: Map<string, Uso>): string {
  const { lineas, vivas } = cabecera(meta, grafo);
  lineas.push('Abre solo las que necesites, por su id entre corchetes.');
  if (vivas.some((n) => n.estado === 'reciente')) lineas.push('Las marcadas (reciente) nadie las ha revisado: contrástalas antes de actuar.');
  if (vivas.length === 0) lineas.push('', 'Cerebro vacío.');
  const porUso = ordenPorUso(uso);
  for (const tipo of TIPOS) {
    const delTipo = vivas.filter((n) => n.tipo === tipo).sort(porUso);
    if (delTipo.length === 0) continue;
    lineas.push('', `## ${NOMBRE_TIPO[tipo]}`, ...delTipo.map(linea));
  }
  if (errores.length) lineas.push('', `Notas con errores (no cargadas): ${errores.join('; ')}`);
  return lineas.join('\n');
}

function ordenPorUso(uso: Map<string, Uso>) {
  return (a: Nota, b: Nota) => (uso.get(b.id)?.lecturas ?? 0) - (uso.get(a.id)?.lecturas ?? 0) || a.titulo.localeCompare(b.titulo);
}

function importancia(grafo: Grafo, uso: Map<string, Uso>, nota: Nota): number {
  return 3 * (uso.get(nota.id)?.lecturas ?? 0) + (grafo.entrantes.get(nota.id)?.length ?? 0);
}

function mapaPorTemas(meta: MetaCerebro, grafo: Grafo, errores: string[], uso: Map<string, Uso>, presupuesto: number): string {
  const { lineas, vivas } = cabecera(meta, grafo);
  const consolidadas = vivas.filter((n) => n.estado !== 'reciente');
  const recientes = vivas.filter((n) => n.estado === 'reciente');
  const porImportancia = (a: Nota, b: Nota) => importancia(grafo, uso, b) - importancia(grafo, uso, a) || a.titulo.localeCompare(b.titulo);
  lineas.push(
    `Índice por temas: el mapa completo pasa del presupuesto de ${presupuesto} tokens.`,
    `Abre un tema con \`mapa ${meta.nombre} <tema>\` (ej. \`${ejemploDeTema(consolidadas)}\`) o ve directo con \`buscar ${meta.nombre} <palabras>\`.`,
  );

  for (const tipo of TIPOS) {
    const delTipo = consolidadas.filter((n) => n.tipo === tipo);
    if (delTipo.length === 0) continue;
    lineas.push('', `## ${NOMBRE_TIPO[tipo]} (${delTipo.length})`);
    // una etiqueta que llevan casi todas las notas del tipo no separa nada: se usa la siguiente
    const frecuencia = new Map<string, number>();
    for (const n of delTipo) for (const t of new Set(n.tags.map((x) => slug(x)))) frecuencia.set(t, (frecuencia.get(t) ?? 0) + 1);
    const temaEnTipo = (n: Nota): string =>
      n.tags.map((t) => slug(t)).find((t) => t && (frecuencia.get(t) ?? 0) <= delTipo.length * 0.6) ?? temaDe(n);
    const temas = new Map<string, Nota[]>();
    for (const n of delTipo) temas.set(temaEnTipo(n), [...(temas.get(temaEnTipo(n)) ?? []), n]);
    for (const [tema, notas] of [...temas].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
      const ejemplos = [...notas].sort(porImportancia).slice(0, 3).map((n) => n.id);
      lineas.push(`- ${tipo}/${tema} · ${notas.length} ${notas.length === 1 ? 'nota' : 'notas'} · ${ejemplos.join(', ')}`);
    }
  }

  // con lo que quede de presupuesto: las notas que más se leen y más se enlazan, ya con su descripción
  const pie: string[] = [];
  if (recientes.length) {
    pie.push('', `## Sin revisar (${recientes.length})`, 'Las escribió un agente y nadie las ha consolidado: contrástalas antes de actuar.');
    pie.push(...recientes.sort(porImportancia).slice(0, 15).map(linea));
    if (recientes.length > 15) pie.push(`… y ${recientes.length - 15} más: \`mapa ${meta.nombre} recientes\`.`);
  }
  if (errores.length) pie.push('', `Notas con errores (no cargadas): ${errores.join('; ')}`);

  const destacadas: string[] = [];
  let gastado = tokensDe([...lineas, ...pie].join('\n')) + 20;
  for (const nota of [...consolidadas].sort(porImportancia)) {
    const l = linea(nota);
    if (gastado + tokensDe(l) + 1 > presupuesto) break;
    destacadas.push(l);
    gastado += tokensDe(l) + 1;
  }
  if (destacadas.length) lineas.push('', '## Lo más usado y enlazado', ...destacadas);
  return [...lineas, ...pie].join('\n');
}

function ejemploDeTema(notas: Nota[]): string {
  const n = notas[0];
  return n ? `${n.tipo}/${temaDe(n)}` : 'decision';
}

/** Temas disponibles, para decirlos cuando piden uno que no existe */
export function temasDe(grafo: Grafo): string[] {
  const temas = new Set<string>();
  for (const n of grafo.notas.values()) if (n.estado !== 'obsoleta') temas.add(`${n.tipo}/${temaDe(n)}`);
  return [...temas].sort();
}

/**
 * Submapa. El selector puede ser un tipo (`decision`), un tema (`precios`), los dos (`modulo/precios`)
 * o `recientes`.
 */
function mapaDeTema(meta: MetaCerebro, grafo: Grafo, uso: Map<string, Uso>, selector: string): string {
  const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta');
  const s = selector.toLowerCase().trim();
  let elegidas: Nota[];
  if (s === 'recientes') elegidas = vivas.filter((n) => n.estado === 'reciente');
  else {
    const [a, b] = s.includes('/') ? s.split('/', 2) : [s, undefined];
    const tipo = TIPOS.includes(a as Tipo) ? (a as Tipo) : undefined;
    const tema = slug(b ?? (tipo ? '' : a));
    elegidas = vivas.filter((n) => (!tipo || n.tipo === tipo) && (!tema || n.tags.some((t) => slug(t) === tema)));
    if (tema === 'general') elegidas = vivas.filter((n) => (!tipo || n.tipo === tipo) && n.tags.length === 0);
  }
  if (elegidas.length === 0) {
    throw new ErrorNota(`No hay notas en "${selector}" de ${meta.nombre}. Temas que sí existen: ${temasDe(grafo).join(', ')}, recientes.`);
  }
  const lineas = [`# Cerebro ${meta.nombre} · ${selector}`, `${elegidas.length} notas. Abre las que necesites por su id entre corchetes.`];
  const porUso = ordenPorUso(uso);
  for (const tipo of TIPOS) {
    const delTipo = elegidas.filter((n) => n.tipo === tipo).sort(porUso);
    if (delTipo.length) lineas.push('', `## ${NOMBRE_TIPO[tipo]}`, ...delTipo.map(linea));
  }
  return lineas.join('\n');
}

export function textoMapa(meta: MetaCerebro, grafo: Grafo, errores: string[], uso: Map<string, Uso>, selector?: string): string {
  if (selector) return mapaDeTema(meta, grafo, uso, selector);
  const presupuesto = meta.presupuestoMapa ?? PRESUPUESTO_MAPA;
  const completo = mapaCompleto(meta, grafo, errores, uso);
  return tokensDe(completo) <= presupuesto ? completo : mapaPorTemas(meta, grafo, errores, uso, presupuesto);
}
