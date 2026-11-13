import { parse } from 'yaml';
import {
  cargarNotas,
  commit,
  conBloqueo,
  guardarMapa,
  guardarNota,
  leerEventos,
  leerMeta,
  leerUso,
  listarCerebros,
  nombresDeCerebros,
  origenActual,
  proyectoActual,
  registrarActividad,
  respaldoDiario,
  rotarActividad,
  sesionActual,
} from './almacen.ts';
import { buscarEnGrafo, parecidoDeTitulo, sugerencias, type Filtros, type Resultado } from './busqueda.ts';
import { construirGrafo, enlaceExterno, indiceDeNotas, resolverEnlace, salientesDe, vecindario } from './grafo.ts';
import { textoMapa } from './mapa.ts';
import { ErrorNota, extraerEnlaces, hoy, relacionesDe, slug, tokensDe, vencida } from './nota.ts';
import { avisosDeForma, buscarSecretos, CONTENIDO_MINIMO, DESCRIPCION_MAXIMA } from './reglas.ts';
import {
  ESTADOS,
  NOMBRE_RELACION,
  NOMBRE_TIPO,
  RELACIONES,
  TIPOS,
  type Estado,
  type Grafo,
  type Nota,
  type Relacion,
  type Tipo,
} from './tipos.ts';

export type { Resultado };

export async function abrir(nombre: string): Promise<{ grafo: Grafo; errores: string[] }> {
  const { notas, errores } = await cargarNotas(nombre);
  return { grafo: construirGrafo(notas, nombresDeCerebros()), errores };
}

/** Búsqueda sobre un grafo ya abierto (la usa el servidor de la app) */
export function puntuar(grafo: Grafo, consulta: string, tipo?: Tipo, limite = 8): Resultado[] {
  return buscarEnGrafo(grafo, consulta, { tipo }, limite);
}

/* ── Mapa ───────────────────────────────────────────────────────────── */

// MAPA.md lo importan los CLAUDE.md de los proyectos (@ruta): así el agente arranca con el mapa
// sin depender de hooks, que la política corporativa desactiva (allowManagedHooksOnly)
const CABECERA_MAPA = '<!-- Generado por Cerebro. No editar: se reescribe con cada cambio. -->';

async function mapaRaiz(nombre: string): Promise<string> {
  const meta = await leerMeta(nombre);
  const { grafo, errores } = await abrir(nombre);
  return textoMapa(meta, grafo, errores, await leerUso(nombre));
}

export async function regenerarMapa(nombre: string): Promise<void> {
  await guardarMapa(nombre, `${CABECERA_MAPA}\n${await mapaRaiz(nombre)}\n`);
}

export async function mapa(nombre: string, selector?: string): Promise<string> {
  const meta = await leerMeta(nombre);
  const { grafo, errores } = await abrir(nombre);
  const uso = await leerUso(nombre);
  const texto = textoMapa(meta, grafo, errores, uso, selector);
  if (!selector) await guardarMapa(nombre, `${CABECERA_MAPA}\n${texto}\n`);
  await registrarActividad(nombre, 'mapa', [], { consulta: selector, tokens: tokensDe(texto) });
  return texto;
}

/* ── Buscar ─────────────────────────────────────────────────────────── */

export interface OpcionesBuscar extends Filtros {
  limite?: number;
  /** busca en todos los cerebros y dice de cuál es cada resultado */
  todos?: boolean;
}

function lineaResultado(r: Resultado, cerebro?: string): string {
  return `- [${cerebro ? `${cerebro}:` : ''}${r.id}] ${r.titulo} (${r.tipo}): ${r.descripcion}\n  ${r.fragmento}`;
}

export async function buscar(nombre: string, consulta: string, opciones: OpcionesBuscar | Tipo = {}): Promise<string> {
  const op: OpcionesBuscar = typeof opciones === 'string' ? { tipo: opciones } : opciones;
  const limite = Math.min(Math.max(op.limite ?? 8, 1), 30);

  if (op.todos) {
    const juntos: { cerebro: string; r: Resultado }[] = [];
    for (const c of await listarCerebros()) {
      const { grafo } = await abrir(c.nombre);
      const resultados = buscarEnGrafo(grafo, consulta, op, limite, await leerUso(c.nombre));
      // los puntajes de cerebros distintos no se comparan tal cual: se llevan a la escala del mejor de cada uno
      const mejor = resultados[0]?.puntaje || 1;
      juntos.push(...resultados.map((r) => ({ cerebro: c.nombre, r: { ...r, puntaje: r.puntaje / mejor } })));
    }
    juntos.sort((a, b) => b.r.puntaje - a.r.puntaje);
    const texto = juntos.length
      ? juntos.slice(0, limite).map((j) => lineaResultado(j.r, j.cerebro)).join('\n')
      : `Sin resultados para "${consulta}" en ningún cerebro.`;
    await registrarActividad(nombre, 'buscar', juntos.filter((j) => j.cerebro === nombre).map((j) => j.r.id), {
      consulta,
      tokens: tokensDe(texto),
    });
    return texto;
  }

  const { grafo } = await abrir(nombre);
  const resultados = buscarEnGrafo(grafo, consulta, op, limite, await leerUso(nombre));
  let texto: string;
  if (resultados.length === 0) {
    const parecidas = sugerencias(grafo, consulta);
    const otros = (await listarCerebros()).filter((c) => c.nombre !== nombre).map((c) => c.nombre);
    texto = [
      `Sin resultados para "${consulta}" en ${nombre}.`,
      parecidas.length ? `Palabras parecidas que sí están: ${parecidas.join(', ')}.` : '',
      'Prueba con menos palabras o con otra forma de decirlo, o abre el índice con `mapa`.',
      otros.length ? `Otros cerebros: ${otros.join(', ')} (\`--todos\` busca en todos).` : '',
      'Si lo encuentras por otro camino, agrégale a esa nota un `alias` con las palabras que usaste.',
    ]
      .filter(Boolean)
      .join('\n');
  } else {
    // vecinas de los mejores resultados que no salieron: a menudo son el siguiente paso
    const ids = new Set(resultados.map((r) => r.id));
    const cercanas = new Set<string>();
    for (const r of resultados.slice(0, 3)) {
      for (const v of [...salientesDe(grafo, r.id), ...(grafo.entrantes.get(r.id) ?? [])]) {
        if (!ids.has(v) && grafo.notas.get(v)?.estado !== 'obsoleta') cercanas.add(v);
      }
    }
    texto = resultados.map((r) => lineaResultado(r)).join('\n');
    if (cercanas.size) texto += `\nRelacionadas: ${[...cercanas].slice(0, 8).join(', ')}`;
  }
  await registrarActividad(nombre, 'buscar', resultados.map((r) => r.id), { consulta, tokens: tokensDe(texto) });
  return texto;
}

/* ── Leer ───────────────────────────────────────────────────────────── */

export interface OpcionesLeer {
  /** solo la ficha: descripción, secciones y enlaces */
  breve?: boolean;
  /** solo la sección con este título */
  seccion?: string;
}

function ficha(nota: Nota): string[] {
  const datos = [`tipo: ${nota.tipo}`, `estado: ${nota.estado}`, `actualizado: ${nota.actualizado}`];
  if (nota.verificado && nota.verificado !== nota.actualizado) datos.push(`verificado: ${nota.verificado}`);
  if (nota.validoDesde || nota.validoHasta) datos.push(`válido: ${nota.validoDesde ?? '…'} a ${nota.validoHasta ?? '…'}`);
  if (nota.tags.length) datos.push(`tags: ${nota.tags.join(', ')}`);
  const lineas = [`# ${nota.titulo} [${nota.id}]`, datos.join(' · ')];
  if (nota.alias?.length) lineas.push(`También se busca como: ${nota.alias.join(', ')}`);
  if (nota.fuente?.length) lineas.push(`Fuente: ${nota.fuente.join(', ')}`);
  if (nota.origen) lineas.push(`Escrita por: ${nota.origen}${nota.proyecto ? ` (proyecto ${nota.proyecto})` : ''}`);
  return lineas;
}

function avisosDeConfianza(grafo: Grafo, nota: Nota): string[] {
  const avisos: string[] = [];
  if (nota.fusionadaEn) avisos.push(`Fusionada en [${nota.fusionadaEn}]: lee esa en su lugar.`);
  if (nota.estado === 'obsoleta' && !nota.fusionadaEn) avisos.push('OBSOLETA: retirada del mapa y de la búsqueda; se conserva como historia. Para lo vigente, mira el repositorio o las notas que la enlazan.');
  if (nota.estado === 'reciente') avisos.push('SIN REVISAR: la escribió un agente y nadie la ha consolidado. Contrástala con el repositorio antes de actuar.');
  if (vencida(nota)) avisos.push(`VENCIDA desde ${nota.validoHasta}: confirma si sigue siendo cierta.`);
  if (nota.revisar) avisos.push(`POR REVISAR: ${nota.revisar}`);
  const reemplazos = grafo.aristas.filter((a) => a.relacion === 'reemplaza' && a.destino === nota.id).map((a) => a.origen);
  if (reemplazos.length) avisos.push(`Reemplazada por: ${reemplazos.join(', ')}. Lee esa.`);
  const choques = grafo.aristas
    .filter((a) => a.relacion === 'contradice' && (a.origen === nota.id || a.destino === nota.id))
    .map((a) => (a.origen === nota.id ? a.destino : a.origen));
  if (choques.length) avisos.push(`En conflicto con: ${choques.join(', ')}. No elijas tú: pregúntale al usuario cuál vale.`);
  return avisos;
}

function secciones(contenido: string): { titulo: string; texto: string }[] {
  const partes: { titulo: string; texto: string }[] = [];
  let actual: { titulo: string; lineas: string[] } | undefined;
  let enBloque = false;
  for (const l of contenido.split(/\r?\n/)) {
    if (/^\s*```/.test(l)) enBloque = !enBloque;
    const m = !enBloque && l.match(/^#{1,4}\s+(.+?)\s*$/);
    if (m) {
      if (actual) partes.push({ titulo: actual.titulo, texto: actual.lineas.join('\n').trim() });
      actual = { titulo: m[1], lineas: [l] };
    } else actual?.lineas.push(l);
  }
  if (actual) partes.push({ titulo: actual.titulo, texto: actual.lineas.join('\n').trim() });
  return partes;
}

function pieDeEnlaces(grafo: Grafo, nota: Nota): string[] {
  const pie: string[] = [];
  for (const r of RELACIONES) {
    const ids = grafo.aristas.filter((a) => a.origen === nota.id && a.relacion === r).map((a) => a.destino);
    if (ids.length) pie.push(`${NOMBRE_RELACION[r]}: ${ids.join(', ')}`);
  }
  const sal = grafo.aristas.filter((a) => a.origen === nota.id && a.clase === 'enlace' && !a.relacion).map((a) => a.destino);
  const ent = grafo.entrantes.get(nota.id) ?? [];
  if (sal.length) pie.push(`Enlaza a: ${sal.join(', ')}`);
  if (ent.length) pie.push(`Enlazada desde: ${[...new Set(ent)].join(', ')}`);
  const ext = grafo.externos.get(nota.id) ?? [];
  if (ext.length) pie.push(`En otros cerebros: ${ext.join(', ')}`);
  return pie;
}

export async function leer(nombre: string, ids: string[], opciones: OpcionesLeer = {}): Promise<string> {
  const { grafo } = await abrir(nombre);
  const indice = indiceDeNotas(grafo.notas);
  const leidas: string[] = [];
  const bloques: string[] = [];

  for (const pedido of ids) {
    // [[otro-cerebro:id]] se lee desde aquí sin cambiar de cerebro
    const externo = enlaceExterno(pedido, nombresDeCerebros());
    if (externo && !resolverEnlace(grafo.notas, indice, pedido)) {
      bloques.push(await leer(externo.cerebro, [externo.id], opciones));
      continue;
    }
    const id = resolverEnlace(grafo.notas, indice, pedido);
    const nota = id ? grafo.notas.get(id) : undefined;
    if (!nota) {
      const parecidas = buscarEnGrafo(grafo, pedido.replace(/-/g, ' '), {}, 3).map((r) => r.id);
      bloques.push(`[${pedido}] no existe en ${nombre}.${parecidas.length ? ` Quizás: ${parecidas.join(', ')}.` : ' Búscala con `buscar`.'}`);
      continue;
    }
    leidas.push(nota.id);
    const cabecera = [...ficha(nota), ...avisosDeConfianza(grafo, nota)];
    const pie = pieDeEnlaces(grafo, nota);
    const partes = secciones(nota.contenido);

    if (opciones.seccion) {
      const buscada = slug(opciones.seccion);
      const parte = partes.find((p) => slug(p.titulo) === buscada) ?? partes.find((p) => slug(p.titulo).includes(buscada));
      bloques.push(
        parte
          ? [`# ${nota.titulo} [${nota.id}] · ${parte.titulo}`, '', parte.texto].join('\n')
          : `[${nota.id}] no tiene la sección "${opciones.seccion}". Secciones: ${partes.map((p) => p.titulo).join(' | ') || '(ninguna)'}.`,
      );
      continue;
    }
    if (opciones.breve) {
      const resumen = [...cabecera, '', nota.descripcion];
      if (partes.length) resumen.push(`Secciones: ${partes.map((p) => p.titulo).join(' | ')}`);
      resumen.push(`Completa: ~${tokensDe(nota.contenido)} tokens`, ...pie);
      bloques.push(resumen.join('\n'));
      continue;
    }
    bloques.push([...cabecera, '', nota.contenido, ...(pie.length ? ['', ...pie] : [])].join('\n'));
  }

  const texto = bloques.join('\n\n---\n\n');
  // una lectura breve no cuenta como uso: el refuerzo mide notas que de verdad se leyeron
  if (leidas.length) await registrarActividad(nombre, opciones.breve ? 'buscar' : 'leer', leidas, { tokens: tokensDe(texto) });
  return texto;
}

/* ── Vecinos ────────────────────────────────────────────────────────── */

export async function vecinos(nombre: string, pedido: string, saltos = 1): Promise<string> {
  const { grafo } = await abrir(nombre);
  const id = resolverEnlace(grafo.notas, indiceDeNotas(grafo.notas), pedido);
  const nota = id ? grafo.notas.get(id) : undefined;
  if (!nota) throw new ErrorNota(`[${pedido}] no existe en ${nombre}. Búscala con \`buscar ${nombre} <palabras>\`.`);
  const n = Math.min(Math.max(saltos, 1), 3);
  const cerca = vecindario(grafo, nota.id, n);
  const lineas = [`# Alrededor de ${nota.titulo} [${nota.id}]`];
  const relaciones = pieDeEnlaces(grafo, nota).filter((l) => !l.startsWith('Enlaza') && !l.startsWith('Enlazada'));
  lineas.push(...relaciones);
  for (let d = 1; d <= n; d++) {
    const aEsta = [...cerca].filter(([, dist]) => dist === d).map(([v]) => grafo.notas.get(v)).filter((v): v is Nota => !!v);
    if (aEsta.length === 0) continue;
    lineas.push('', `## A ${d} ${d === 1 ? 'salto' : 'saltos'} (${aEsta.length})`);
    lineas.push(...aEsta.sort((a, b) => a.id.localeCompare(b.id)).map((v) => `- [${v.id}] ${v.descripcion}${v.estado === 'obsoleta' ? ' (obsoleta)' : ''}`));
  }
  if (cerca.size === 0) lineas.push('No tiene notas enlazadas.');
  const texto = lineas.join('\n');
  await registrarActividad(nombre, 'buscar', [nota.id], { consulta: `vecinos ${nota.id}`, tokens: tokensDe(texto) });
  return texto;
}

/* ── Escribir ───────────────────────────────────────────────────────── */

export interface EntradaNota {
  id?: string;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  contenido: string;
  tags?: string[];
  estado?: Estado;
  alias?: string[];
  fuente?: string[];
  verificado?: string;
  validoDesde?: string;
  validoHasta?: string;
  relaciones?: Partial<Record<Relacion, string[]>>;
  origen?: string;
  /** escribe aunque ya exista una nota con casi el mismo título */
  forzar?: boolean;
}

// Los agentes escriben "descripcion: algo: con dos puntos" y eso no es YAML válido.
// Si el YAML falla, cada línea es clave: valor cortando en el primer ":".
function frontmatterTolerante(texto: string): Record<string, unknown> {
  try {
    return (parse(texto) ?? {}) as Record<string, unknown>;
  } catch {
    const fm: Record<string, unknown> = {};
    for (const linea of texto.split(/\r?\n/)) {
      const m = linea.match(/^([a-z_]+):\s*(.*)$/);
      if (!m) continue;
      const valor = m[2].trim();
      fm[m[1]] = /^\[.*\]$/.test(valor)
        ? valor.slice(1, -1).split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : valor.replace(/^["'](.*)["']$/, '$1');
    }
    return fm;
  }
}

const FORMATO_NOTA = `---
titulo: Caché de consultas con vencimiento corto
tipo: decision
descripcion: Las consultas se guardan 10 minutos; reemplaza la caché sin vencimiento que servía datos viejos
tags: [rendimiento]
fuente: [src/cache.ts]
---
Qué se decidió y **por qué**, con enlaces a lo relacionado: [[servicio-de-consultas]].`;

export function entradaDesdeTexto(texto: string): EntradaNota {
  const m = texto.replace(/^﻿/, '').match(/^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new ErrorNota(`La nota debe llegar por la entrada estándar con este formato:\n\n${FORMATO_NOTA}`);
  const fm = frontmatterTolerante(m[1]);
  for (const campo of ['titulo', 'tipo', 'descripcion']) {
    if (!fm[campo]) throw new ErrorNota(`Falta "${campo}" en el frontmatter. Formato:\n\n${FORMATO_NOTA}`);
  }
  const lista = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.map(String).filter(Boolean) : v === undefined || v === null || v === '' ? undefined : [String(v)];
  const fecha = (v: unknown): string | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ErrorNota(`Fecha no válida: "${s}". Usa AAAA-MM-DD (ej. ${hoy()}).`);
    return s;
  };
  return {
    id: fm.id ? String(fm.id) : undefined,
    titulo: String(fm.titulo),
    tipo: String(fm.tipo) as Tipo,
    descripcion: String(fm.descripcion),
    contenido: m[2].trim(),
    tags: lista(fm.tags),
    estado: fm.estado ? (String(fm.estado) as Estado) : undefined,
    alias: lista(fm.alias),
    fuente: lista(fm.fuente),
    verificado: fecha(fm.verificado),
    validoDesde: fecha(fm.valido_desde),
    validoHasta: fecha(fm.valido_hasta),
    relaciones: relacionesDe(fm),
  };
}

function validarEntrada(entrada: EntradaNota): string {
  if (!TIPOS.includes(entrada.tipo)) throw new ErrorNota(`Tipo no válido: "${entrada.tipo}". Usa uno de: ${TIPOS.join(', ')}.`);
  if (entrada.estado && !ESTADOS.includes(entrada.estado)) {
    throw new ErrorNota(`Estado no válido: "${entrada.estado}". Usa uno de: ${ESTADOS.join(', ')}.`);
  }
  const descripcion = entrada.descripcion.trim().replace(/\s+/g, ' ');
  if (!descripcion) throw new ErrorNota('La descripción es obligatoria: es la única línea de la nota que se ve en el mapa.');
  if (descripcion.length > DESCRIPCION_MAXIMA) {
    throw new ErrorNota(
      `La descripción tiene ${descripcion.length} caracteres y el máximo es ${DESCRIPCION_MAXIMA}. ` +
        'Deja una sola frase que permita decidir si abrir la nota; el detalle va en el contenido.',
    );
  }
  if (entrada.contenido.trim().length < CONTENIDO_MINIMO) {
    throw new ErrorNota(`La nota casi no tiene contenido. Escribe qué es y por qué importa (mínimo ${CONTENIDO_MINIMO} caracteres).`);
  }
  const secretos = buscarSecretos(`${entrada.titulo}\n${descripcion}\n${entrada.contenido}`);
  if (secretos.length) {
    throw new ErrorNota(
      `No se guardó: la nota parece traer un secreto (${secretos.slice(0, 3).join('; ')}; la línea 1 es el título y la 2 la descripción). ` +
        'Un cerebro nunca guarda claves, tokens ni contraseñas: quítalo y escribe solo dónde vive (por ejemplo «en .env.local»).',
    );
  }
  return descripcion;
}

function armarNota(id: string, entrada: EntradaNota, descripcion: string, previa: Nota | undefined, estado: Estado): Nota {
  return {
    id,
    titulo: entrada.titulo.trim(),
    tipo: entrada.tipo,
    descripcion,
    estado,
    tags: entrada.tags ?? previa?.tags ?? [],
    creado: previa?.creado || hoy(),
    actualizado: hoy(),
    contenido: entrada.contenido.trim(),
    enlaces: extraerEnlaces(entrada.contenido),
    alias: entrada.alias ?? previa?.alias,
    fuente: entrada.fuente ?? previa?.fuente,
    // quien la escribe hoy la da por cierta hoy
    verificado: entrada.verificado ?? hoy(),
    validoDesde: entrada.validoDesde ?? previa?.validoDesde,
    validoHasta: entrada.validoHasta ?? previa?.validoHasta,
    relaciones: entrada.relaciones ?? previa?.relaciones,
    origen: previa?.origen ?? entrada.origen ?? origenActual(),
    // una nota importada no pertenece al proyecto desde el que se corrió el importador
    proyecto: entrada.origen === 'importacion' ? undefined : (previa?.proyecto ?? proyectoActual()),
    sesion: sesionActual() ?? previa?.sesion,
  };
}

async function despuesDeEscribir(nombre: string): Promise<void> {
  await regenerarMapa(nombre);
  await rotarActividad(nombre);
  await respaldoDiario(nombre);
}

export async function escribir(nombre: string, entrada: EntradaNota): Promise<string> {
  await leerMeta(nombre);
  const descripcion = validarEntrada(entrada);

  return conBloqueo(nombre, async () => {
    const { grafo } = await abrir(nombre);
    const id = entrada.id ? slug(entrada.id) : slug(entrada.titulo);
    if (!id) throw new ErrorNota('No se pudo sacar un id del título: usa letras o números.');
    const previa = grafo.notas.get(id);

    // sin `id` no se actualiza: un título repetido no debe sobrescribir en silencio lo que ya se sabía
    if (previa && !entrada.id && !entrada.forzar) {
      throw new ErrorNota(
        `No se guardó: ya existe [${id}] «${previa.titulo}». Léela primero (\`leer ${nombre} ${id}\`) y, para actualizarla, ` +
          `agrega \`id: ${id}\` al frontmatter con el contenido completo que debe quedar. Si es otra idea, cambia el título.`,
      );
    }
    // regla de admisión: una idea, una nota. Antes de crear otra, que no exista ya
    if (!previa && !entrada.forzar) {
      const gemela = [...grafo.notas.values()].find((n) => n.estado !== 'obsoleta' && parecidoDeTitulo(n.titulo, entrada.titulo) >= 0.8);
      if (gemela) {
        throw new ErrorNota(
          `No se guardó: ya existe [${gemela.id}] «${gemela.titulo}», con casi el mismo título. ` +
            `Si es la misma idea, actualízala agregando \`id: ${gemela.id}\` al frontmatter. Si de verdad es otra, cambia el título o repite con --forzar.`,
        );
      }
    }

    const nota = armarNota(id, entrada, descripcion, previa, entrada.estado ?? 'reciente');
    await guardarNota(nombre, nota);

    const notas = new Map(grafo.notas).set(id, nota);
    const nuevo = construirGrafo(notas, nombresDeCerebros());
    const rotos = nuevo.rotos.get(id) ?? [];
    const conectada = salientesDe(nuevo, id).length > 0 || (nuevo.entrantes.get(id)?.length ?? 0) > 0;

    await commit(nombre, `cerebro: ${previa ? 'actualiza' : 'agrega'} ${id}`, [`notas/${id}.md`]);
    await registrarActividad(nombre, 'escribir', [id]);
    await despuesDeEscribir(nombre);

    const respuesta = [`${previa ? 'Actualizada' : 'Creada'} [${id}] en ${nombre} (${nota.estado}).`];
    if (rotos.length) respuesta.push(`Enlaces que no existen: ${rotos.join(', ')}. Corrígelos o crea esas notas.`);
    for (const ext of nuevo.externos.get(id) ?? []) {
      const e = enlaceExterno(ext, nombresDeCerebros());
      if (e && !(await cargarNotas(e.cerebro)).notas.has(slug(e.id))) respuesta.push(`[[${ext}]] apunta a una nota que no existe en ${e.cerebro}.`);
    }
    const parecidas = buscarEnGrafo(nuevo, `${nota.titulo} ${nota.descripcion}`, { estricta: true, sinonimos: false }, 5);
    const propio = parecidas.find((r) => r.id === id)?.puntaje ?? 0;
    const cercanas = parecidas.filter((r) => r.id !== id);
    if (!conectada) {
      respuesta.push(
        `Sin conexiones: quedó colgada del hub ${NOMBRE_TIPO[nota.tipo]}.` +
          (cercanas.length ? ` Enlázala con [[id]] a alguna de: ${cercanas.slice(0, 4).map((r) => r.id).join(', ')}` : ''),
      );
    }
    // lo que más se le parece: si dice lo mismo sobra una; si dice lo contrario hay que resolverlo
    const dobles = previa ? [] : cercanas.filter((r) => propio > 0 && r.puntaje >= 0.55 * propio).slice(0, 3);
    if (dobles.length) {
      respuesta.push(
        `Se parece a: ${dobles.map((r) => r.id).join(', ')}. Léelas: si dicen lo mismo, fusiona en una; ` +
          'si dicen lo contrario, no elijas tú: pregúntale al usuario y márcalo con `contradice: [id]`.',
      );
    }
    respuesta.push(...avisosDeForma(nota.descripcion, nota.contenido));
    return respuesta.join('\n');
  });
}

/* ── Cerrar la sesión ───────────────────────────────────────────────── */

const SEPARADOR_NOTAS = /^={3,}\s*$/m;

/**
 * Sin hooks, guardar lo aprendido depende de que el agente lo haga antes de terminar. `cerrar` sin texto dice qué
 * revisar; con texto, guarda varias notas de una vez (separadas por una línea ===), todas como recientes.
 */
export async function cerrar(nombre: string, texto: string): Promise<string> {
  await leerMeta(nombre);
  if (!texto.trim()) {
    const sesion = sesionActual();
    const propias = (await leerEventos(nombre)).filter((e) => e.accion === 'escribir' && sesion && e.sesion === sesion).flatMap((e) => e.notas);
    return [
      `Cierre de sesión en ${nombre}. ${propias.length ? `Ya guardaste en esta sesión: ${[...new Set(propias)].join(', ')}.` : 'En esta sesión no has guardado nada.'}`,
      '',
      'Repasa la sesión y guarda SOLO lo que una sesión futura necesitaría y no puede sacar del repositorio:',
      '- una decisión y su porqué (incluidas las alternativas que se descartaron);',
      '- algo no obvio que costó descubrir (una trampa, una causa raíz, un límite);',
      '- una preferencia o corrección del usuario sobre cómo trabajar;',
      '- en qué quedó el trabajo, si se retomará.',
      '',
      'No guardes: lo que el código o el historial de git ya dicen, pasos intermedios, ni nada que no sobreviva a esta semana.',
      'Antes de escribir cada una, `buscar` por si ya existe: si existe, actualízala con su `id`.',
      '',
      `Para guardar varias de una vez, envíalas a \`cerrar ${nombre}\` por la entrada estándar, separadas por una línea ===:`,
      '',
      FORMATO_NOTA,
      '===',
      '---',
      'titulo: …',
      '---',
      '…',
      '',
      'Si no hay nada que valga la pena, no escribas nada: una memoria vale por lo que deja fuera.',
    ].join('\n');
  }
  const partes = texto.split(SEPARADOR_NOTAS).map((p) => p.trim()).filter(Boolean);
  const lineas: string[] = [];
  let guardadas = 0;
  for (const [i, parte] of partes.entries()) {
    try {
      lineas.push(await escribir(nombre, { ...entradaDesdeTexto(parte), estado: 'reciente' }));
      guardadas++;
    } catch (e) {
      lineas.push(`Nota ${i + 1} no guardada: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  lineas.push('', `${guardadas} de ${partes.length} notas guardadas como recientes en ${nombre}. Quedan sin revisar hasta que se consoliden.`);
  return lineas.join('\n');
}

/* ── Etiquetas y estado ─────────────────────────────────────────────── */

/** etiquetas vagas que no separan temas: se quitan al poner el tema */
const ETIQUETAS_VAGAS = new Set(['feedback', 'preferencias', 'convenciones']);

/**
 * Pone a cada nota su tema como primera etiqueta y quita las vagas; las demás etiquetas se conservan. No toca el
 * contenido, el estado ni la fecha de actualización (ordenar etiquetas no es actualizar la nota) y no cuenta como
 * actividad de agentes. `mapaTemas`: id -> tema.
 */
export async function etiquetar(nombre: string, mapaTemas: Record<string, string>): Promise<string> {
  return conBloqueo(nombre, async () => {
    const { grafo } = await abrir(nombre);
    const cambiadas: string[] = [];
    const faltantes: string[] = [];
    for (const [id, tema] of Object.entries(mapaTemas)) {
      const nota = grafo.notas.get(id);
      if (!nota) {
        faltantes.push(id);
        continue;
      }
      const tags = [tema, ...nota.tags.filter((t) => t !== tema && !ETIQUETAS_VAGAS.has(t))];
      if (tags.join('|') === nota.tags.join('|')) continue;
      await guardarNota(nombre, { ...nota, tags });
      cambiadas.push(id);
    }
    if (cambiadas.length) {
      await commit(nombre, `cerebro: ordena etiquetas de ${cambiadas.length} notas`, cambiadas.map((id) => `notas/${id}.md`));
      await regenerarMapa(nombre);
    }
    return [`Etiquetas ordenadas en ${cambiadas.length} notas.`, faltantes.length ? `No existen: ${faltantes.join(', ')}` : '']
      .filter(Boolean)
      .join('\n');
  });
}

export async function cambiarEstado(nombre: string, ids: string[], estado: Estado, fusionadaEn?: string): Promise<string> {
  return conBloqueo(nombre, async () => {
    const { grafo } = await abrir(nombre);
    if (fusionadaEn && !grafo.notas.has(fusionadaEn)) {
      throw new ErrorNota(`No existe la nota destino [${fusionadaEn}]. Revisa el id con \`buscar\`.`);
    }
    const cambiadas: string[] = [];
    const faltantes: string[] = [];
    for (const id of ids) {
      const nota = grafo.notas.get(id);
      if (!nota) {
        faltantes.push(id);
        continue;
      }
      await guardarNota(nombre, {
        ...nota,
        estado,
        fusionadaEn: estado === 'obsoleta' ? fusionadaEn : undefined,
        actualizado: hoy(),
        // consolidar es revisar: la nota queda verificada hoy y sin marca de duda
        verificado: estado === 'consolidada' ? hoy() : nota.verificado,
        revisar: estado === 'consolidada' ? undefined : nota.revisar,
      });
      cambiadas.push(id);
    }
    if (cambiadas.length) {
      await commit(nombre, `cerebro: marca ${estado} ${cambiadas.slice(0, 6).join(', ')}${cambiadas.length > 6 ? '…' : ''}`, cambiadas.map((id) => `notas/${id}.md`));
      await registrarActividad(nombre, 'estado', cambiadas);
      await despuesDeEscribir(nombre);
    }
    return [
      cambiadas.length ? `Marcadas ${estado}: ${cambiadas.join(', ')}` : 'Ninguna nota cambió.',
      faltantes.length ? `No existen: ${faltantes.join(', ')}. Revisa los ids con \`buscar\`.` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });
}

/* ── Importar en lote ───────────────────────────────────────────────── */

/**
 * Siembra muchas notas de una vez: se validan todas, se escriben, y el mapa y el commit se hacen una sola vez.
 * Así los enlaces entre notas del mismo lote se resuelven sin importar el orden.
 */
export async function importarLote(nombre: string, entradas: EntradaNota[], estado: Estado = 'consolidada', origen = 'importacion'): Promise<string> {
  await leerMeta(nombre);
  const descripciones = entradas.map((e, i) => {
    try {
      return validarEntrada(e);
    } catch (err) {
      throw new ErrorNota(`Nota ${i + 1} («${e.titulo}»): ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  const vistos = new Map<string, string>();
  for (const e of entradas) {
    const id = e.id ? slug(e.id) : slug(e.titulo);
    if (!id) throw new ErrorNota(`«${e.titulo}»: no se pudo sacar un id del título.`);
    if (vistos.has(id)) throw new ErrorNota(`Dos notas del lote dan el mismo id [${id}]: «${vistos.get(id)}» y «${e.titulo}».`);
    vistos.set(id, e.titulo);
  }
  return conBloqueo(nombre, async () => {
    const { grafo } = await abrir(nombre);
    const ids: string[] = [];
    for (const [i, e] of entradas.entries()) {
      const id = e.id ? slug(e.id) : slug(e.titulo);
      await guardarNota(nombre, armarNota(id, { origen, ...e }, descripciones[i], grafo.notas.get(id), e.estado ?? estado));
      ids.push(id);
    }
    await commit(nombre, `cerebro: siembra ${entradas.length} notas`);
    await registrarActividad(nombre, 'escribir', ids.slice(0, 50));
    await despuesDeEscribir(nombre);
    const nuevo = (await abrir(nombre)).grafo;
    const avisos: string[] = [];
    for (const id of ids) {
      const rotos = nuevo.rotos.get(id);
      if (rotos?.length) avisos.push(`[${id}] enlaza a notas que no existen: ${rotos.join(', ')}`);
    }
    const sueltas = nuevo.aristas.filter((a) => a.clase === 'hub' && ids.includes(a.origen)).map((a) => a.origen);
    if (sueltas.length) avisos.push(`Sin conexiones: ${sueltas.join(', ')}`);
    return [...avisos, `Importadas ${entradas.length} notas en ${nombre} (${estado}).`].join('\n');
  });
}
