// Traer conocimiento que ya existe: una bóveda de Obsidian, la documentación de un repositorio o la memoria propia
// de Claude Code. Todos muestran primero qué harían; solo escriben con `aplicar`.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { guardarMeta, leerMeta } from './almacen.ts';
import { importarLote, type EntradaNota } from './consultas.ts';
import { ErrorNota, slug, tokensDe } from './nota.ts';
import { DESCRIPCION_MAXIMA, DESCRIPCION_RECOMENDADA, NOTA_LARGA_TOKENS } from './reglas.ts';
import { TIPOS, type Tipo } from './tipos.ts';

const SALTAR = new Set(['node_modules', 'dist', 'build', 'coverage', 'vendor']);

async function archivosMd(raizDir: string, profundidad = 8): Promise<string[]> {
  const salida: string[] = [];
  const andar = async (dir: string, nivel: number): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      // lo que empieza por punto o guion bajo es configuración o plantilla, no conocimiento
      if (e.name.startsWith('.') || e.name.startsWith('_') || SALTAR.has(e.name)) continue;
      const ruta = join(dir, e.name);
      if (e.isDirectory()) {
        if (nivel < profundidad) await andar(ruta, nivel + 1);
      } else if (/\.mdx?$/i.test(e.name)) salida.push(ruta);
    }
  };
  await andar(raizDir, 0);
  return salida.sort();
}

function partir(crudo: string): { fm: Record<string, unknown>; cuerpo: string } {
  const texto = crudo.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = texto.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { fm: {}, cuerpo: texto.trim() };
  let fm: Record<string, unknown> = {};
  try {
    fm = (parse(m[1]) ?? {}) as Record<string, unknown>;
  } catch {
    // Obsidian tolera frontmatter que no es YAML estricto: se lee línea a línea
    let clave = '';
    for (const linea of m[1].split('\n')) {
      const item = linea.match(/^\s+-\s+(.*)$/);
      if (item && clave) {
        const actual = fm[clave];
        fm[clave] = [...(Array.isArray(actual) ? actual : []), item[1].trim().replace(/^["'](.*)["']$/, '$1')];
        continue;
      }
      const kv = linea.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (!kv) continue;
      clave = kv[1];
      const valor = kv[2].trim();
      fm[clave] =
        valor === ''
          ? []
          : /^\[.*\]$/.test(valor) && !valor.startsWith('[[')
            ? valor.slice(1, -1).split(',').map((t) => t.trim().replace(/^["'](.*)["']$/, '$1')).filter(Boolean)
            : valor.replace(/^["'](.*)["']$/, '$1');
    }
  }
  return { fm, cuerpo: m[2].trim() };
}

const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : v === undefined || v === null || v === '' ? [] : [String(v)]);

function limpio(texto: string): string {
  return texto
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|`|^#+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Una frase para el mapa a partir de un párrafo: las primeras oraciones que quepan */
function descripcionDe(parrafo: string): { texto: string; recortada: boolean } {
  const plano = limpio(parrafo);
  const frases = plano.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«\d])/);
  let d = frases[0] ?? '';
  for (const f of frases.slice(1)) {
    if (`${d} ${f}`.length > (d.length < 60 ? DESCRIPCION_MAXIMA - 30 : DESCRIPCION_RECOMENDADA)) break;
    d = `${d} ${f}`;
  }
  d = d.replace(/[.]$/, '');
  d = d.charAt(0).toUpperCase() + d.slice(1);
  if (d.length <= DESCRIPCION_MAXIMA - 20) return { texto: d, recortada: false };
  const corte = d.slice(0, DESCRIPCION_MAXIMA - 30);
  return { texto: `${corte.slice(0, corte.lastIndexOf(' '))}…`, recortada: true };
}

function primerParrafo(cuerpo: string): string {
  for (const bloque of cuerpo.split(/\n\s*\n/)) {
    const b = bloque.trim();
    if (!b || /^(#|```|\||!\[|<|---)/.test(b) || /^>\s*\[!/.test(b)) continue;
    return b.replace(/^> ?/gm, '');
  }
  return '';
}

/* ── Obsidian ───────────────────────────────────────────────────────── */

const CALLOUT: Record<string, string> = {
  info: 'Nota', note: 'Nota', quote: 'En una frase', success: 'Hecho', tip: 'Consejo', todo: 'Pendiente', warning: 'Atención',
  abstract: 'Resumen', summary: 'Resumen', danger: 'Peligro', important: 'Importante', question: 'Pregunta', example: 'Ejemplo', bug: 'Error',
};

// valor de `tipo` en el frontmatter, o palabra en el nombre de la carpeta → tipo de Orbis
const TIPOS_POR_DEFECTO: [RegExp, Tipo][] = [
  [/^(adr|decision|decisiones|decisions)$/, 'decision'],
  [/^(persona|personas|person|people|organizacion|organizaciones|equipo)$/, 'persona'],
  [/^(concepto|conceptos|glosario|glossary|termino|terminos)$/, 'glosario'],
  [/^(runbook|runbooks|guia|guias|convencion|convenciones|how-?to|operacion|procedimiento)$/, 'convencion'],
  [/^(dia|diario|daily|version|versiones|reunion|reuniones|pendiente|pendientes|estado|historia|roadmap|bitacora)$/, 'estado'],
  [/^(moc|indice|index|mapa|negocio|documento|contexto)$/, 'contexto'],
  [/^(modulo|modulos|arquitectura|tabla|tablas|migracion|migraciones|pantalla|pantallas|api|servicio|componente|producto)$/, 'modulo'],
];

function tipoDeObsidian(fm: Record<string, unknown>, carpetas: string[], propios: Record<string, string>): Tipo {
  const candidatos = [String(fm.tipo ?? fm.type ?? ''), ...[...carpetas].reverse()].map((c) => slug(c.replace(/^\d+\s*/, ''))).filter(Boolean);
  for (const c of candidatos) {
    const propio = propios[c];
    if (propio && TIPOS.includes(propio as Tipo)) return propio as Tipo;
  }
  for (const c of candidatos) {
    for (const palabra of c.split('-')) for (const [patron, tipo] of TIPOS_POR_DEFECTO) if (patron.test(palabra) || patron.test(c)) return tipo;
  }
  return 'contexto';
}

export interface OpcionesImportar {
  aplicar?: boolean;
  /** {"<valor de tipo o nombre de carpeta>": "<tipo de Orbis>"} */
  tipos?: Record<string, string>;
}

/**
 * Convierte una bóveda de Obsidian: el nombre del archivo es el título (así los [[enlaces]] siguen valiendo), el
 * resumen que abre la nota pasa a ser la descripción, los callouts se vuelven citas y `aliases` y `fuente` pasan a campos.
 */
export async function importarObsidian(nombre: string, boveda: string, opciones: OpcionesImportar = {}): Promise<string> {
  await leerMeta(nombre);
  const carpeta = resolve(boveda);
  if (!existsSync(carpeta)) throw new ErrorNota(`No existe la carpeta ${carpeta}. Pasa la ruta de la bóveda de Obsidian.`);
  const propios = Object.fromEntries(Object.entries(opciones.tipos ?? {}).map(([k, v]) => [slug(k), v]));
  const entradas: EntradaNota[] = [];
  const recortadas: string[] = [];
  const sinResumen: string[] = [];

  for (const ruta of await archivosMd(carpeta)) {
    const titulo = basename(ruta).replace(/\.mdx?$/i, '');
    const { fm, cuerpo: crudo } = partir(await readFile(ruta, 'utf8'));
    let cuerpo = crudo.replace(/^(?:[^\n#>]{0,20}\n)?# .+\n+/, '');
    if (!cuerpo.trim()) continue;

    const cita = cuerpo.match(/^((?:>.*\n?)+)/);
    const resumen = cita && !/^>\s*\[!/.test(cita[1]) ? cita[1].replace(/^> ?/gm, '') : primerParrafo(cuerpo);
    if (!resumen) sinResumen.push(titulo);
    const { texto: descripcion, recortada } = descripcionDe(resumen || titulo);
    if (recortada) recortadas.push(titulo);

    cuerpo = cuerpo
      .replace(/^>\s*\[!([a-zA-Z]+)\][-+]?[ \t]*(.*)$/gm, (_, clase: string, resto: string) => `> **${resto.trim() || CALLOUT[clase.toLowerCase()] || clase}**`)
      .replace(/<details>\s*<summary>([\s\S]*?)<\/summary>/g, (_, s: string) => `**${s.trim()}**\n`)
      .replace(/<\/?details>/g, '')
      .replace(/<br\s*\/?>/g, ' · ');

    const carpetas = relative(carpeta, dirname(ruta)).split(/[\\/]/).filter(Boolean);
    const tags = [...new Set([String(fm.area ?? ''), ...lista(fm.tags)].map((t) => t.replace(/^#/, '')).filter(Boolean))];
    const estadoBoveda = String(fm.estado ?? fm.status ?? '');
    if (estadoBoveda && !['vigente', 'activo', 'active'].includes(estadoBoveda)) tags.push(estadoBoveda);
    entradas.push({
      titulo,
      tipo: tipoDeObsidian(fm, carpetas, propios),
      descripcion,
      contenido: cuerpo.trim(),
      tags,
      alias: lista(fm.aliases ?? fm.alias).filter((a) => a !== titulo),
      fuente: lista(fm.fuente ?? fm.source),
    });
  }
  if (entradas.length === 0) throw new ErrorNota(`No encontré notas Markdown en ${carpeta}.`);

  const porTipo = new Map<string, number>();
  for (const e of entradas) porTipo.set(e.tipo, (porTipo.get(e.tipo) ?? 0) + 1);
  const informe = [
    `Bóveda ${carpeta}: ${entradas.length} notas.`,
    `Por tipo: ${[...porTipo].map(([t, c]) => `${t} ${c}`).join(', ')}`,
    recortadas.length ? `Descripciones recortadas por largas (${recortadas.length}): ${recortadas.slice(0, 12).join(', ')}${recortadas.length > 12 ? '…' : ''}. Conviene reescribirlas después.` : '',
    sinResumen.length ? `Sin resumen, quedan con el título como descripción (${sinResumen.length}): ${sinResumen.slice(0, 12).join(', ')}` : '',
  ].filter(Boolean);
  if (!opciones.aplicar) {
    return [...informe, '', 'Esto es la vista previa: no se escribió nada. Si los tipos no cuadran, pásalos con --tipos <archivo.json>.', 'Para importar, repite con --aplicar.'].join('\n');
  }
  return [...informe, '', await importarLote(nombre, entradas)].join('\n');
}

/* ── Sembrar desde la documentación de un repositorio ───────────────── */

function tipoDeDocumento(rel: string): Tipo {
  const r = rel.toLowerCase();
  if (/(^|\/)(adr|adrs|decisions|decisiones)\//.test(r) || /adr[-_ ]?\d+/.test(r)) return 'decision';
  if (/glosario|glossary/.test(r)) return 'glosario';
  if (/estado|status|roadmap|pendientes|todo\.md/.test(r)) return 'estado';
  if (/contributing|convenc|conventions|style|guia|guide|runbook|deploy|desarrollo|development|claude\.md|agents\.md/.test(r)) return 'convencion';
  if (/readme|contexto|overview|vision/.test(r)) return 'contexto';
  return 'modulo';
}

function esquema(cuerpo: string, rel: string): string {
  const partes = cuerpo.split(/^(?=## )/m);
  const lineas: string[] = [];
  for (const parte of partes) {
    const titulo = parte.match(/^## (.+)$/m)?.[1];
    const parrafo = limpio(primerParrafo(parte.replace(/^## .+$/m, ''))).slice(0, 400);
    if (titulo) lineas.push(`## ${titulo}`, parrafo ? `${parrafo}${parrafo.length === 400 ? '…' : ''}` : '', '');
    else if (parrafo) lineas.push(parrafo, '');
  }
  lineas.push(`Es un resumen por secciones. El documento completo está en \`${rel}\`.`);
  return lineas.join('\n').trim();
}

/**
 * Siembra un cerebro con la documentación que el proyecto ya tiene (README, CLAUDE.md, docs/, ADR). Un documento, una
 * nota, con su ruta como fuente. Los cortos entran completos; los largos, como resumen por secciones. No lee código
 * ni el CHANGELOG: eso ya lo dice el repositorio.
 */
export async function sembrar(nombre: string, repo: string, opciones: OpcionesImportar = {}): Promise<string> {
  const meta = await leerMeta(nombre);
  const carpeta = resolve(repo);
  if (!existsSync(carpeta)) throw new ErrorNota(`No existe la carpeta ${carpeta}. Pasa la ruta del repositorio.`);
  const docs = (await archivosMd(carpeta, 5))
    .map((ruta) => ({ ruta, rel: relative(carpeta, ruta).split('\\').join('/') }))
    .filter(({ rel }) => !/changelog|license|licencia|third_party|code_of_conduct|security\.md/i.test(rel))
    .filter(({ rel }) => !rel.includes('/') || /^(docs?|documentacion|adr|adrs|decisions|architecture|arquitectura)\//i.test(rel) || (/(^|\/)(readme|claude|agents)\.md$/i.test(rel) && rel.split('/').length <= 3))
    .slice(0, 150);
  if (docs.length === 0) throw new ErrorNota(`No encontré documentación Markdown en ${carpeta} (README.md, CLAUDE.md, docs/…).`);

  const entradas: EntradaNota[] = [];
  const vistos = new Set<string>();
  const filas: string[] = [];
  for (const { ruta, rel } of docs) {
    const { cuerpo: crudo } = partir(await readFile(ruta, 'utf8'));
    if (crudo.length < 80) continue;
    const h1 = crudo.match(/^# (.+)$/m)?.[1];
    let titulo = limpio(h1 ?? basename(rel).replace(/\.mdx?$/i, '')).slice(0, 70);
    if (/^(readme|index|claude|agents)$/i.test(titulo) || vistos.has(slug(titulo))) {
      titulo = `${titulo} (${dirname(rel) === '.' ? basename(carpeta) : dirname(rel)})`.slice(0, 78);
    }
    if (!slug(titulo) || vistos.has(slug(titulo))) continue;
    vistos.add(slug(titulo));
    const cuerpo = crudo.replace(/^# .+\n+/, '').trim();
    const largo = tokensDe(cuerpo) > NOTA_LARGA_TOKENS;
    const contenido = largo ? esquema(cuerpo, rel) : cuerpo;
    if (contenido.length < 40) continue;
    const tipo = tipoDeDocumento(rel);
    entradas.push({ titulo, tipo, descripcion: descripcionDe(primerParrafo(cuerpo) || titulo).texto, contenido, fuente: [rel], tags: ['documentacion'] });
    filas.push(`- ${tipo.padEnd(10)} [${slug(titulo)}] ← ${rel}${largo ? ' (resumen por secciones)' : ''}`);
  }

  const informe = [`Documentación de ${carpeta}: ${entradas.length} notas.`, ...filas];
  if (!opciones.aplicar) {
    return [
      ...informe,
      '',
      'Esto es la vista previa: no se escribió nada. Para sembrar, repite con --aplicar.',
      'Después revisa las notas: las de resumen conviene reescribirlas guardando el porqué.',
    ].join('\n');
  }
  if (meta.repo !== carpeta) await guardarMeta({ ...meta, repo: carpeta });
  return [...informe, '', await importarLote(nombre, entradas)].join('\n');
}

/* ── Memoria propia de Claude Code ──────────────────────────────────── */

const TIPO_DE_MEMORIA: Record<string, Tipo> = { user: 'persona', feedback: 'convencion', project: 'contexto', reference: 'contexto' };

/** Carpeta de memoria de Claude Code para el proyecto en el que se está */
export function carpetaDeMemoria(proyecto = process.cwd()): string {
  return join(homedir(), '.claude', 'projects', proyecto.replace(/[^a-zA-Z0-9]/g, '-'), 'memory');
}

/**
 * Pasa al cerebro lo que Claude Code guardó en su memoria propia, para que haya una sola memoria que se pueda ver y
 * revisar. Entran como recientes: las escribió un agente y nadie las ha revisado.
 */
export async function importarMemoria(nombre: string, carpeta?: string, opciones: OpcionesImportar = {}): Promise<string> {
  await leerMeta(nombre);
  const dir = carpeta ? resolve(carpeta) : carpetaDeMemoria();
  if (!existsSync(dir)) throw new ErrorNota(`No hay memoria de Claude Code en ${dir}. Pasa la carpeta: importar-memoria ${nombre} <ruta>.`);
  const entradas: EntradaNota[] = [];
  for (const archivo of (await readdir(dir)).filter((a) => a.endsWith('.md') && a !== 'MEMORY.md').sort()) {
    const { fm, cuerpo } = partir(await readFile(join(dir, archivo), 'utf8'));
    const clave = String(fm.name ?? archivo.replace(/\.md$/, ''));
    const tipoMemoria = String((fm.metadata as Record<string, unknown> | undefined)?.type ?? fm.type ?? 'project');
    if (cuerpo.length < 30) continue;
    const titulo = clave.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
    entradas.push({
      id: slug(clave),
      titulo,
      tipo: TIPO_DE_MEMORIA[tipoMemoria] ?? 'contexto',
      descripcion: descripcionDe(String(fm.description ?? primerParrafo(cuerpo) ?? titulo)).texto,
      contenido: cuerpo,
      tags: ['memoria-de-claude', tipoMemoria],
      fuente: [`memoria de Claude Code: ${archivo}`],
    });
  }
  if (entradas.length === 0) return `No hay memorias que importar en ${dir}.`;
  const informe = [`Memoria de Claude Code en ${dir}: ${entradas.length} notas.`, ...entradas.map((e) => `- ${e.tipo.padEnd(10)} [${e.id}] ${e.descripcion}`)];
  if (!opciones.aplicar) return [...informe, '', 'Vista previa: no se escribió nada. Para importar, repite con --aplicar.'].join('\n');
  return [...informe, '', await importarLote(nombre, entradas, 'reciente', 'agente')].join('\n');
}
