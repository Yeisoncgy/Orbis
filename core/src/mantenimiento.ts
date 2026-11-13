// Cuidar un cerebro: comprobarlo, medirlo, consolidarlo, podarlo y deshacer. Nada de aquí borra una nota.
import { existsSync } from 'node:fs';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ARCHIVO_PREGUNTAS,
  borrarArchivoDeNota,
  cargarNotas,
  commit,
  conBloqueo,
  guardarMeta,
  guardarNota,
  historialGit,
  leerEventos,
  leerMeta,
  leerUso,
  raizRespaldos,
  respaldar,
  revertirGit,
  rutaCerebro,
} from './almacen.ts';
import { buscarEnGrafo, parecidoDeTitulo } from './busqueda.ts';
import { abrir, regenerarMapa } from './consultas.ts';
import { enlaceExterno, indiceDeNotas, resolverEnlace } from './grafo.ts';
import { PRESUPUESTO_MAPA, textoMapa } from './mapa.ts';
import { ErrorNota, hoy, slug, tokensDe, vencida } from './nota.ts';
import { DESCRIPCION_RECOMENDADA, NOTA_LARGA_TOKENS, pareceCodigo } from './reglas.ts';
import { RELACIONES, type Grafo, type Nota } from './tipos.ts';

const lista = (ids: string[], tope = 40): string => (ids.length > tope ? `${ids.slice(0, tope).join(', ')} … y ${ids.length - tope} más` : ids.join(', '));

function diasDesde(fecha: string | undefined): number {
  if (!fecha) return Infinity;
  const t = Date.parse(fecha);
  return Number.isNaN(t) ? Infinity : Math.floor((Date.now() - t) / 86400000);
}

/* ── Verificar ──────────────────────────────────────────────────────── */

export async function verificar(nombre: string): Promise<string> {
  const meta = await leerMeta(nombre);
  const { grafo, errores } = await abrir(nombre);
  const uso = await leerUso(nombre);
  const todas = [...grafo.notas.values()];
  const vivas = todas.filter((n) => n.estado !== 'obsoleta');
  const porTipo = new Map<string, number>();
  for (const n of todas) porTipo.set(n.tipo, (porTipo.get(n.tipo) ?? 0) + 1);

  const lineas = [
    `${nombre}: ${todas.length} notas, ${grafo.aristas.filter((a) => a.clase === 'enlace').length} enlaces`,
    `Por tipo: ${[...porTipo].map(([t, c]) => `${t} ${c}`).join(', ')}`,
  ];
  const colgadas = grafo.aristas.filter((a) => a.clase === 'hub').map((a) => a.origen);
  if (colgadas.length) lineas.push(`Sin conexiones (colgadas del hub): ${lista(colgadas)}`);
  for (const [id, rotos] of grafo.rotos) lineas.push(`Enlaces rotos en ${id}: ${rotos.join(', ')}`);
  for (const [id, externos] of grafo.externos) {
    for (const ext of externos) {
      const e = enlaceExterno(ext, new Set([ext.split(':')[0]]));
      if (e && !(await cargarNotas(e.cerebro)).notas.has(slug(e.id))) lineas.push(`Enlace roto en ${id}: [[${ext}]] no existe en ${e.cerebro}`);
    }
  }
  for (const e of errores) lineas.push(`Error: ${e}`);

  const recientes = vivas.filter((n) => n.estado === 'reciente').map((n) => n.id);
  if (recientes.length) lineas.push(`Sin revisar (${recientes.length}): ${lista(recientes)}. Revísalas con \`consolidar ${nombre}\`.`);
  const vencidas = vivas.filter((n) => vencida(n)).map((n) => n.id);
  if (vencidas.length) lineas.push(`Vencidas (${vencidas.length}): ${lista(vencidas)}`);
  const dudosas = vivas.filter((n) => n.revisar).map((n) => n.id);
  if (dudosas.length) lineas.push(`Marcadas para revisar (${dudosas.length}): ${lista(dudosas)}`);
  const choques = grafo.aristas.filter((a) => a.relacion === 'contradice').map((a) => `${a.origen} ↔ ${a.destino}`);
  if (choques.length) lineas.push(`Contradicciones sin resolver: ${choques.join('; ')}`);
  const largas = vivas.filter((n) => n.descripcion.length > DESCRIPCION_RECOMENDADA).length;
  if (largas) lineas.push(`Descripciones de más de ${DESCRIPCION_RECOMENDADA} caracteres: ${largas}`);

  const presupuesto = meta.presupuestoMapa ?? PRESUPUESTO_MAPA;
  const raizMapa = tokensDe(textoMapa(meta, grafo, errores, uso));
  const completo = tokensDe(vivas.map((n) => `- [${n.id}] ${n.descripcion}`).join('\n'));
  lineas.push(
    `Mapa: ~${raizMapa} tokens (presupuesto ${presupuesto})` +
      (completo > presupuesto ? `; el listado completo serían ~${completo}, por eso va por temas` : ''),
  );
  return lineas.join('\n');
}

/* ── Comprobar contra el repositorio ────────────────────────────────── */

const SALTAR = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.vercel', '.turbo', 'coverage', '__pycache__', '.venv']);
const TOPE_ARCHIVOS = 60000;

async function rutasDelRepo(raizRepo: string): Promise<Set<string>> {
  const rutas = new Set<string>();
  const pila = [''];
  while (pila.length && rutas.size < TOPE_ARCHIVOS) {
    const rel = pila.pop() as string;
    let entradas;
    try {
      entradas = await readdir(join(raizRepo, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (SALTAR.has(e.name)) continue;
      const hija = rel ? `${rel}/${e.name}` : e.name;
      rutas.add(hija);
      if (e.isDirectory()) pila.push(hija);
    }
  }
  return rutas;
}

/** Rutas de archivo que una nota cita: su `fuente` y lo que escribe entre comillas invertidas con forma de ruta */
function rutasCitadas(nota: Nota): string[] {
  const citadas = new Set<string>();
  // parecen rutas pero no lo son: tipos MIME, direcciones web sin https, paquetes de npm, eventos con puntos
  const esRuta = (t: string) => {
    if (!/^[\w.-]+(\/[\w@.()[\] -]+)+$/.test(t) || /[*<>{}$]|\.\.\.|node_modules/.test(t)) return false;
    const primero = t.split('/')[0];
    if (/^(image|application|text|audio|video|font|multipart)$/.test(primero)) return false;
    if (primero === '.' || primero === '..' || (primero.includes('.') && !primero.startsWith('.'))) return false;
    if (primero === '.git' || t.endsWith('/.git')) return false;
    // sin extensión solo cuenta si tiene pinta de carpeta: tres tramos o más y ninguno de una o dos letras (`v/vt/vn`)
    return /\.[a-z0-9]{1,5}$/i.test(t) || (t.split('/').length >= 3 && t.split('/').every((tramo) => tramo.length > 2));
  };
  for (const f of nota.fuente ?? []) if (esRuta(f.trim())) citadas.add(f.trim().replace(/\/$/, ''));
  for (const m of nota.contenido.matchAll(/`([^`\n]+)`/g)) {
    const t = m[1].trim().replace(/[:#].*$/, '').replace(/\/$/, '');
    if (esRuta(t)) citadas.add(t);
  }
  return [...citadas];
}

const MOTIVO_RUTAS = 'cita rutas que ya no existen en el repositorio';

/**
 * Una nota que cita un archivo que ya no existe probablemente describe algo que cambió. Se comprueba contra la
 * carpeta del proyecto: una ruta vale si coincide con el final de alguna ruta real (las notas las escriben relativas
 * a distintas subcarpetas). Con `marcar`, la duda queda escrita en la nota y sale en el mapa y al leerla.
 */
export async function comprobar(nombre: string, repo?: string, marcar = false): Promise<string> {
  const meta = await leerMeta(nombre);
  const carpeta = repo ? resolve(repo) : meta.repo;
  if (!carpeta) {
    throw new ErrorNota(`Falta la carpeta del proyecto. Úsalo así: comprobar ${nombre} <ruta del repositorio>. Queda guardada para la próxima vez.`);
  }
  if (!existsSync(carpeta)) throw new ErrorNota(`No existe la carpeta ${carpeta}. Pasa la ruta correcta del repositorio.`);
  if (repo && meta.repo !== carpeta) await guardarMeta({ ...meta, repo: carpeta });

  const reales = await rutasDelRepo(carpeta);
  const existe = (ruta: string): boolean => {
    if (reales.has(ruta)) return true;
    const cola = `/${ruta}`;
    for (const r of reales) if (r.endsWith(cola)) return true;
    return false;
  };

  return conBloqueo(nombre, async () => {
    const { grafo } = await abrir(nombre);
    const lineas: string[] = [];
    const cambiadas: string[] = [];
    let revisadas = 0;
    let citas = 0;
    for (const nota of grafo.notas.values()) {
      if (nota.estado === 'obsoleta') continue;
      const citadas = rutasCitadas(nota);
      if (citadas.length === 0) continue;
      revisadas++;
      citas += citadas.length;
      const faltan = citadas.filter((r) => !existe(r));
      if (faltan.length) lineas.push(`- [${nota.id}] ya no existen: ${faltan.slice(0, 6).join(', ')}${faltan.length > 6 ? ` … y ${faltan.length - 6} más` : ''}`);
      if (!marcar) continue;
      const motivo = faltan.length ? `${MOTIVO_RUTAS}: ${faltan.slice(0, 4).join(', ')}` : undefined;
      const previo = nota.revisar?.startsWith(MOTIVO_RUTAS) ? nota.revisar : undefined;
      if (motivo !== previo && (motivo || previo)) {
        await guardarNota(nombre, { ...nota, revisar: motivo ?? undefined });
        cambiadas.push(nota.id);
      }
    }
    if (cambiadas.length) {
      await commit(nombre, `cerebro: comprueba ${cambiadas.length} notas contra el repositorio`);
      await regenerarMapa(nombre);
    }
    const cabecera = `${nombre} contra ${carpeta}: ${revisadas} notas citan ${citas} rutas; ${lineas.length} notas citan algo que ya no existe.`;
    const pie = marcar
      ? `Marcadas o desmarcadas: ${cambiadas.length}. Al corregir una nota (o consolidarla) la marca se quita.`
      : lineas.length
        ? 'Con --marcar la duda queda escrita en cada nota y se ve en el mapa y al leerla.'
        : '';
    return [cabecera, ...lineas, pie].filter(Boolean).join('\n');
  });
}

/* ── Consolidar ─────────────────────────────────────────────────────── */

/** Notas consolidadas que más se parecen a una (para revisarla junto a ellas) */
export function parecidasA(grafo: Grafo, nota: Nota): { id: string; cuanto: number }[] {
  const resultados = buscarEnGrafo(grafo, `${nota.titulo} ${nota.descripcion}`, { estricta: true, sinonimos: false }, 6);
  const propio = resultados.find((r) => r.id === nota.id)?.puntaje ?? resultados[0]?.puntaje ?? 1;
  return resultados
    .filter((r) => r.id !== nota.id && grafo.notas.get(r.id)?.estado === 'consolidada')
    .map((r) => ({ id: r.id, cuanto: Math.max(r.puntaje / propio, parecidoDeTitulo(nota.titulo, r.titulo)) }))
    .filter((p) => p.cuanto >= 0.35)
    .slice(0, 3);
}

/**
 * Propone qué hacer con cada nota reciente (fusionar, dejar o resolver un choque) y qué notas viejas ya no valen.
 * No cambia nada: decide el agente con el usuario y aplica con `estado` y `escribir`.
 */
export async function consolidar(nombre: string): Promise<string> {
  const { grafo } = await abrir(nombre);
  const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta');
  const recientes = vivas.filter((n) => n.estado === 'reciente').sort((a, b) => a.actualizado.localeCompare(b.actualizado));
  const lineas = [`# Consolidar ${nombre}: ${recientes.length} notas sin revisar`];

  for (const nota of recientes) {
    const parecidas = parecidasA(grafo, nota);
    lineas.push('', `[${nota.id}] «${nota.titulo}» · ${nota.tipo} · ${nota.origen ?? 'origen desconocido'} · ${nota.actualizado}`);
    if (nota.revisar) lineas.push(`  Ojo: ${nota.revisar}`);
    if (parecidas.length === 0) {
      lineas.push('  No se parece a ninguna consolidada.', `  Si es cierta y útil: estado ${nombre} consolidada ${nota.id}`);
      continue;
    }
    lineas.push(`  Se parece a: ${parecidas.map((p) => `${p.id} (${Math.round(p.cuanto * 100)} %)`).join(', ')}`);
    lineas.push(
      `  Léelas juntas: leer ${nombre} ${nota.id} ${parecidas.map((p) => p.id).join(' ')}`,
      `  · Si dice lo mismo: integra lo nuevo en la otra (escribir con su id) y luego: estado ${nombre} obsoleta ${nota.id} --fusionada-en ${parecidas[0].id}`,
      '  · Si dice lo contrario: no elijas tú. Muéstrale las dos versiones al usuario.',
      `  · Si es otra idea: estado ${nombre} consolidada ${nota.id}`,
    );
  }

  const viejas: string[] = [];
  for (const n of vivas) {
    if (vencida(n)) viejas.push(`- [${n.id}] venció el ${n.validoHasta}`);
    else if (n.revisar) viejas.push(`- [${n.id}] ${n.revisar}`);
  }
  for (const a of grafo.aristas) {
    if (a.relacion === 'reemplaza' && grafo.notas.get(a.destino)?.estado !== 'obsoleta') viejas.push(`- [${a.destino}] la reemplaza ${a.origen}`);
  }
  if (viejas.length) {
    lineas.push('', '## Candidatas a obsoleta o a corregir', ...viejas, `Para retirar una: estado ${nombre} obsoleta <id>`);
  }
  const choques = grafo.aristas.filter((a) => a.relacion === 'contradice');
  if (choques.length) {
    lineas.push('', '## Contradicciones abiertas (decide el usuario)', ...choques.map((a) => `- ${a.origen} contradice a ${a.destino}`));
  }
  if (recientes.length === 0 && viejas.length === 0 && choques.length === 0) lineas.push('', 'Nada que consolidar: el cerebro está al día.');
  return lineas.join('\n');
}

/* ── Podar ──────────────────────────────────────────────────────────── */

/** Informe de lo que sobra. No retira nada: cada grupo dice con qué comando hacerlo. */
export async function podar(nombre: string, dias = 120): Promise<string> {
  const { grafo } = await abrir(nombre);
  const uso = await leerUso(nombre);
  const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta');
  const lineas = [`# Poda de ${nombre} (${vivas.length} notas vivas)`];
  const grupo = (titulo: string, ids: string[], consejo: string) => {
    if (ids.length) lineas.push('', `## ${titulo} (${ids.length})`, lista(ids, 60), consejo);
  };

  grupo(
    `Nadie las ha leído y llevan más de ${dias} días sin tocarse`,
    vivas.filter((n) => !uso.get(n.id)?.lecturas && diasDesde(n.actualizado) > dias).map((n) => n.id),
    `Si ya no sirven: estado ${nombre} obsoleta <id...>. Obsoleta se oculta del mapa y de la búsqueda, pero no se borra.`,
  );
  grupo('Vencidas', vivas.filter((n) => vencida(n)).map((n) => n.id), 'Confirma si siguen siendo ciertas: reescríbelas o márcalas obsoletas.');
  grupo('Marcadas para revisar', vivas.filter((n) => n.revisar).map((n) => n.id), 'Corrígelas contra el repositorio o márcalas obsoletas.');
  grupo(
    'Casi todo código o rutas',
    vivas.filter((n) => pareceCodigo(n.contenido)).map((n) => n.id),
    'Repiten lo que el repositorio ya dice: deja solo el porqué o retíralas.',
  );
  grupo(
    `Largas (más de ~${NOTA_LARGA_TOKENS} tokens)`,
    vivas.filter((n) => tokensDe(n.contenido) > NOTA_LARGA_TOKENS).map((n) => `${n.id} (~${tokensDe(n.contenido)})`),
    'Pártelas en notas de una sola idea: así se lee solo lo que hace falta.',
  );
  grupo(
    'Sin conexiones',
    grafo.aristas.filter((a) => a.clase === 'hub').map((a) => a.origen),
    'Enlázalas con [[id]] a lo relacionado o revisa si sobran.',
  );

  const pares: string[] = [];
  const consolidadas = vivas.filter((n) => n.estado === 'consolidada');
  for (let i = 0; i < consolidadas.length; i++) {
    for (let j = i + 1; j < consolidadas.length; j++) {
      if (parecidoDeTitulo(consolidadas[i].titulo, consolidadas[j].titulo) >= 0.7) pares.push(`${consolidadas[i].id} ≈ ${consolidadas[j].id}`);
    }
  }
  if (pares.length) lineas.push('', `## Títulos casi iguales (${pares.length})`, pares.slice(0, 30).join('\n'), 'Si son la misma idea, fusiónalas.');
  if (lineas.length === 1) lineas.push('', 'Nada que podar.');
  return lineas.join('\n');
}

/* ── Renombrar ──────────────────────────────────────────────────────── */

/**
 * Cambia el título (y con él el id) de una nota y reescribe todo lo que apuntaba a ella: enlaces en el texto,
 * relaciones, fusiones y el banco de preguntas. El título anterior queda como alias.
 */
export async function renombrar(nombre: string, pedido: string, tituloNuevo: string): Promise<string> {
  const titulo = tituloNuevo.trim();
  const idNuevo = slug(titulo);
  if (!idNuevo) throw new ErrorNota('El título nuevo no da un id válido: usa letras o números.');
  return conBloqueo(nombre, async () => {
    const { grafo } = await abrir(nombre);
    const indice = indiceDeNotas(grafo.notas);
    const idViejo = resolverEnlace(grafo.notas, indice, pedido);
    const nota = idViejo ? grafo.notas.get(idViejo) : undefined;
    if (!idViejo || !nota) throw new ErrorNota(`[${pedido}] no existe en ${nombre}. Revisa el id con \`buscar\`.`);
    if (idNuevo !== idViejo && grafo.notas.has(idNuevo)) {
      throw new ErrorNota(`Ya existe [${idNuevo}]. Elige otro título o fusiona las dos notas.`);
    }

    const apuntaALaVieja = (destino: string) => resolverEnlace(grafo.notas, indice, destino) === idViejo;
    let tocadas = 0;
    for (const otra of grafo.notas.values()) {
      if (otra.id === idViejo) continue;
      let cambio = false;
      const contenido = otra.contenido.replace(/\[\[([^\]\n]+)\]\]/g, (todo, crudo: string) => {
        const [destinoYSeccion, alias] = crudo.split('|');
        const [destino, seccion] = destinoYSeccion.split('#');
        if (!apuntaALaVieja(destino.trim())) return todo;
        cambio = true;
        return `[[${idNuevo}${seccion ? `#${seccion}` : ''}${alias ? `|${alias}` : ''}]]`;
      });
      const relaciones = otra.relaciones ? { ...otra.relaciones } : undefined;
      for (const r of RELACIONES) {
        const ids = relaciones?.[r];
        if (ids?.some(apuntaALaVieja) && relaciones) {
          relaciones[r] = ids.map((i) => (apuntaALaVieja(i) ? idNuevo : i));
          cambio = true;
        }
      }
      const fusionadaEn = otra.fusionadaEn === idViejo ? idNuevo : otra.fusionadaEn;
      if (fusionadaEn !== otra.fusionadaEn) cambio = true;
      if (!cambio) continue;
      await guardarNota(nombre, { ...otra, contenido, relaciones, fusionadaEn });
      tocadas++;
    }

    const alias = [...new Set([...(nota.alias ?? []), nota.titulo])].filter((a) => slug(a) !== idNuevo);
    await guardarNota(nombre, { ...nota, id: idNuevo, titulo, alias: alias.length ? alias : undefined, actualizado: hoy() });
    if (idNuevo !== idViejo) await borrarArchivoDeNota(nombre, idViejo);

    const rutaPreguntas = join(rutaCerebro(nombre), ARCHIVO_PREGUNTAS);
    if (idNuevo !== idViejo && existsSync(rutaPreguntas)) {
      const preguntas = JSON.parse(await readFile(rutaPreguntas, 'utf8')) as Pregunta[];
      for (const p of preguntas) p.esperadas = p.esperadas.map((i) => (i === idViejo ? idNuevo : i));
      await writeFile(rutaPreguntas, `${JSON.stringify(preguntas, null, 1)}\n`, 'utf8');
    }
    await commit(nombre, `cerebro: renombra ${idViejo} a ${idNuevo}`);
    await regenerarMapa(nombre);
    return `[${idViejo}] ahora es [${idNuevo}] «${titulo}». Enlaces reescritos en ${tocadas} ${tocadas === 1 ? 'nota' : 'notas'}; el título anterior quedó como alias.`;
  });
}

/* ── Medir ──────────────────────────────────────────────────────────── */

export interface Pregunta {
  pregunta: string;
  /** basta con que salga cualquiera de estas */
  esperadas: string[];
}

async function leerPreguntas(nombre: string): Promise<Pregunta[]> {
  const ruta = join(rutaCerebro(nombre), ARCHIVO_PREGUNTAS);
  if (!existsSync(ruta)) return [];
  return JSON.parse(await readFile(ruta, 'utf8')) as Pregunta[];
}

/** Agrega al banco una pregunta real con la nota que debería salir: es con lo que se mide la búsqueda */
export async function agregarPregunta(nombre: string, pregunta: string, esperadas: string[]): Promise<string> {
  if (!pregunta.trim() || esperadas.length === 0) {
    throw new ErrorNota(`Úsalo así: pregunta ${nombre} "cómo se publica" <id de la nota que debería salir> [otro id...]`);
  }
  return conBloqueo(nombre, async () => {
    const { grafo } = await abrir(nombre);
    const indice = indiceDeNotas(grafo.notas);
    const ids = esperadas.map((e) => {
      const id = resolverEnlace(grafo.notas, indice, e);
      if (!id) throw new ErrorNota(`[${e}] no existe en ${nombre}. Revisa el id con \`buscar\`.`);
      return id;
    });
    const preguntas = (await leerPreguntas(nombre)).filter((p) => p.pregunta !== pregunta.trim());
    preguntas.push({ pregunta: pregunta.trim(), esperadas: ids });
    await writeFile(join(rutaCerebro(nombre), ARCHIVO_PREGUNTAS), `${JSON.stringify(preguntas, null, 1)}\n`, 'utf8');
    await commit(nombre, 'cerebro: agrega una pregunta al banco', [ARCHIVO_PREGUNTAS]);
    return `Pregunta guardada. El banco de ${nombre} tiene ${preguntas.length}. Mide con: evaluar ${nombre}`;
  });
}

export interface Medicion {
  n: number;
  a1: number;
  a3: number;
  a5: number;
  mrr: number;
  fallos: string[];
}

export function medir(grafo: Grafo, preguntas: Pregunta[], filtros = {}): Medicion {
  const m: Medicion = { n: preguntas.length, a1: 0, a3: 0, a5: 0, mrr: 0, fallos: [] };
  for (const p of preguntas) {
    const ids = buscarEnGrafo(grafo, p.pregunta, filtros, 8).map((r) => r.id);
    const pos = ids.findIndex((id) => p.esperadas.includes(id));
    if (pos === 0) m.a1++;
    if (pos >= 0 && pos < 3) m.a3++;
    if (pos >= 0 && pos < 5) m.a5++;
    if (pos >= 0) m.mrr += 1 / (pos + 1);
    if (pos < 0 || pos >= 3) m.fallos.push(`${pos < 0 ? 'no sale' : `puesto ${pos + 1}`} · "${p.pregunta}" → salió: ${ids.slice(0, 3).join(', ') || 'nada'} · se esperaba: ${p.esperadas.join(' o ')}`);
  }
  return m;
}

/** Corre el banco de preguntas y dice en qué puesto sale la nota esperada. Sin esto, «mejorar la búsqueda» es una opinión. */
export async function evaluar(nombre: string): Promise<string> {
  const preguntas = await leerPreguntas(nombre);
  if (preguntas.length === 0) {
    return `El cerebro ${nombre} no tiene banco de preguntas. Agrega algunas con: pregunta ${nombre} "<lo que buscaría un agente>" <id que debería salir>`;
  }
  const { grafo } = await abrir(nombre);
  const faltan = [...new Set(preguntas.flatMap((p) => p.esperadas))].filter((id) => !grafo.notas.has(id) || grafo.notas.get(id)?.estado === 'obsoleta');
  const m = medir(grafo, preguntas);
  const pct = (x: number) => `${Math.round((100 * x) / m.n)} %`;
  return [
    `Búsqueda en ${nombre} sobre ${m.n} preguntas:`,
    `- sale de primera: ${pct(m.a1)}`,
    `- entre las 3 primeras: ${pct(m.a3)}`,
    `- entre las 5 primeras: ${pct(m.a5)}`,
    `- MRR: ${(m.mrr / m.n).toFixed(3)}`,
    faltan.length ? `Ojo: el banco espera notas que ya no existen o están obsoletas: ${faltan.join(', ')}` : '',
    m.fallos.length ? `\nNo salen entre las 3 primeras (${m.fallos.length}):\n${m.fallos.map((f) => `- ${f}`).join('\n')}` : '',
    m.fallos.length ? '\nSi la nota esperada es la correcta, agrégale un `alias` con las palabras de la pregunta.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Cómo se está usando el cerebro: lo que se lee, lo que nadie lee, lo que se busca y no se encuentra, y lo que cuesta */
export async function metricas(nombre: string, dias = 30): Promise<string> {
  const meta = await leerMeta(nombre);
  const { grafo, errores } = await abrir(nombre);
  const uso = await leerUso(nombre);
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const eventos = (await leerEventos(nombre)).filter((e) => e.ts >= desde);
  const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta');

  const cuenta = (accion: string) => eventos.filter((e) => e.accion === accion).length;
  const sesiones = new Map<string, { tokens: number; eventos: number }>();
  for (const e of eventos) {
    if (!e.sesion) continue;
    const s = sesiones.get(e.sesion) ?? { tokens: 0, eventos: 0 };
    sesiones.set(e.sesion, { tokens: s.tokens + (e.tokens ?? 0), eventos: s.eventos + 1 });
  }
  const proyectos = new Map<string, number>();
  for (const e of eventos) if (e.proyecto) proyectos.set(e.proyecto, (proyectos.get(e.proyecto) ?? 0) + 1);
  const vacias = new Map<string, number>();
  for (const e of eventos) {
    if (e.accion === 'buscar' && e.consulta && e.notas.length === 0 && !e.consulta.startsWith('vecinos ')) {
      vacias.set(e.consulta, (vacias.get(e.consulta) ?? 0) + 1);
    }
  }
  const leidas = vivas.filter((n) => uso.get(n.id)?.lecturas).length;
  const masLeidas = vivas
    .filter((n) => uso.get(n.id)?.lecturas)
    .sort((a, b) => (uso.get(b.id)?.lecturas ?? 0) - (uso.get(a.id)?.lecturas ?? 0))
    .slice(0, 10)
    .map((n) => `${n.id} (${uso.get(n.id)?.lecturas})`);
  const tokensSesion = [...sesiones.values()].map((s) => s.tokens);
  const media = tokensSesion.length ? Math.round(tokensSesion.reduce((a, b) => a + b, 0) / tokensSesion.length) : 0;

  const lineas = [
    `# Uso de ${nombre} en los últimos ${dias} días`,
    `Mapas: ${cuenta('mapa')} · búsquedas: ${cuenta('buscar')} · lecturas: ${cuenta('leer')} · escrituras: ${cuenta('escribir')} · cambios de estado: ${cuenta('estado')}`,
    `Sesiones que lo usaron: ${sesiones.size}${sesiones.size ? ` · ~${media} tokens devueltos por sesión` : ''}`,
    `El mapa que se carga en cada sesión cuesta ~${tokensDe(textoMapa(meta, grafo, errores, uso))} tokens.`,
    `Notas leídas alguna vez: ${leidas} de ${vivas.length} (${vivas.length ? Math.round((100 * leidas) / vivas.length) : 0} %).`,
  ];
  if (proyectos.size) lineas.push(`Por proyecto: ${[...proyectos].sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p} ${c}`).join(', ')}`);
  if (masLeidas.length) lineas.push(`Más leídas: ${masLeidas.join(', ')}`);
  if (vacias.size) {
    lineas.push(
      '',
      `## Búsquedas sin resultado (${vacias.size})`,
      ...[...vacias].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([q, c]) => `- "${q}"${c > 1 ? ` ×${c}` : ''}`),
      'Cada una es algo que un agente necesitó y no encontró: falta la nota, o le falta un `alias` a la que existe.',
    );
  }
  if (eventos.length === 0) lineas.push('', 'Sin actividad en este periodo: ningún agente lo ha consultado.');
  return lineas.join('\n');
}

/* ── Historial, deshacer y respaldo ─────────────────────────────────── */

export async function historial(nombre: string, id?: string): Promise<string> {
  await leerMeta(nombre);
  const salida = await historialGit(nombre, id ? slug(id) : undefined);
  if (!salida) return id ? `Sin historial para [${id}] en ${nombre}.` : `El cerebro ${nombre} no tiene historial (¿git instalado?).`;
  return `${salida}\n\nPara revertir un cambio: deshacer ${nombre} <código de la primera columna> (sin código, revierte el último).`;
}

export async function deshacer(nombre: string, referencia?: string): Promise<string> {
  await leerMeta(nombre);
  return conBloqueo(nombre, async () => {
    const r = await revertirGit(nombre, referencia ?? 'HEAD');
    if (!r.ok) {
      throw new ErrorNota(
        `No se pudo deshacer ${referencia ?? 'el último cambio'}: ${r.salida.split('\n')[0] || 'git lo rechazó'}. ` +
          `Mira los cambios con \`historial ${nombre}\`; si otro cambio posterior tocó la misma nota, deshaz primero ese.`,
      );
    }
    await regenerarMapa(nombre);
    return `Deshecho ${referencia ?? 'el último cambio'} de ${nombre}. Queda en el historial como una reversión, por si hay que volver.`;
  });
}

export async function respaldarAhora(nombre: string): Promise<string> {
  await leerMeta(nombre);
  const { destino, archivos } = await respaldar(nombre);
  return `Respaldo de ${nombre}: ${archivos} archivos en ${destino}. Carpeta de respaldos: ${raizRespaldos()} (lo ideal es que esté en otro disco).`;
}
