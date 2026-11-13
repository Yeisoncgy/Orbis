import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, copyFile, mkdir, open, readdir, readFile, rename, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { bolsaDe, recordarBolsa, type Bolsa } from './busqueda.ts';
import { ErrorNota, escribirNota, hoy, leerNota } from './nota.ts';
import type { Accion, MetaCerebro, Nota, Uso } from './tipos.ts';

const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9-]{0,40}$/;
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ARCHIVO_META = 'cerebro.json';
const ARCHIVO_ACTIVIDAD = '.actividad.jsonl';
const ARCHIVO_USO = '.uso.json';
const ARCHIVO_MAPA = 'MAPA.md';
const ARCHIVO_INDICE = '.indice.json';
const ARCHIVO_BLOQUEO = '.bloqueo';
const ARCHIVO_RESPALDO = '.ultimo-respaldo';
export const ARCHIVO_PREGUNTAS = 'preguntas.json';
const VERSION_INDICE = 2;
// Lo que no se versiona: telemetría local y archivos que se regeneran
const IGNORADOS = [ARCHIVO_ACTIVIDAD, ARCHIVO_USO, ARCHIVO_MAPA, ARCHIVO_INDICE, ARCHIVO_BLOQUEO, ARCHIVO_RESPALDO, '*.tmp'];
const ACTIVIDAD_MAXIMA = 512 * 1024;
const ACTIVIDAD_CONSERVA = 1500;
const RESPALDOS_QUE_SE_GUARDAN = 7;

export interface Configuracion {
  /** carpeta de los cerebros; la fija el instalador */
  raiz?: string;
  /** carpeta de los respaldos diarios; lo ideal es otro disco */
  respaldo?: string;
}

/** Ajustes del equipo: los escribe `npm run instalar` en ~/.claude/cerebro/config.json */
export function rutaConfiguracion(): string {
  return join(homedir(), '.claude', 'cerebro', 'config.json');
}

let configuracion: Configuracion | undefined;

export function leerConfiguracion(): Configuracion {
  if (configuracion) return configuracion;
  try {
    configuracion = JSON.parse(readFileSync(rutaConfiguracion(), 'utf8')) as Configuracion;
  } catch {
    configuracion = {};
  }
  return configuracion;
}

// Orden: variable de entorno, ajuste del equipo, y por último la carpeta de siempre
export function raiz(): string {
  return process.env.CEREBRO_RAIZ ?? leerConfiguracion().raiz ?? join(homedir(), 'Documents', 'Cerebros');
}

export function raizRespaldos(): string {
  return process.env.CEREBRO_RESPALDO ?? leerConfiguracion().respaldo ?? join(dirname(raiz()), 'Cerebros-respaldo');
}

export function rutaCerebro(nombre: string): string {
  if (!NOMBRE_VALIDO.test(nombre)) {
    throw new ErrorNota(`Nombre de cerebro no válido: "${nombre}". Usa minúsculas, números y guiones (ej. mi-proyecto).`);
  }
  return join(raiz(), nombre);
}

function rutaNota(nombre: string, id: string): string {
  if (!ID_VALIDO.test(id)) throw new ErrorNota(`Id de nota no válido: "${id}". Usa minúsculas, números y guiones, hasta 80 caracteres.`);
  return join(rutaCerebro(nombre), 'notas', `${id}.md`);
}

async function escribirAtomico(ruta: string, texto: string): Promise<void> {
  const tmp = `${ruta}.${process.pid}.tmp`;
  await writeFile(tmp, texto, 'utf8');
  await rename(tmp, ruta);
}

export async function leerMeta(nombre: string): Promise<MetaCerebro> {
  const ruta = join(rutaCerebro(nombre), ARCHIVO_META);
  if (!existsSync(ruta)) {
    const otros = (await listarCerebros().catch(() => [])).map((c) => c.nombre);
    throw new ErrorNota(
      `No existe el cerebro "${nombre}" en ${raiz()}.` +
        (otros.length ? ` Los que hay: ${otros.join(', ')}.` : ' Aún no hay ninguno: créalo con `crear <nombre> "<descripción>"`.'),
    );
  }
  const meta = JSON.parse(await readFile(ruta, 'utf8')) as Partial<MetaCerebro> & { presupuesto_mapa?: number };
  return {
    nombre,
    descripcion: meta.descripcion ?? '',
    personal: meta.personal === true,
    creado: meta.creado ?? '',
    presupuestoMapa: meta.presupuestoMapa ?? meta.presupuesto_mapa,
    repo: meta.repo,
  };
}

export async function guardarMeta(meta: MetaCerebro): Promise<void> {
  const { nombre, ...resto } = meta;
  const limpio = Object.fromEntries(Object.entries({ nombre, ...resto }).filter(([, v]) => v !== undefined));
  await escribirAtomico(join(rutaCerebro(nombre), ARCHIVO_META), `${JSON.stringify(limpio, null, 2)}\n`);
}

/** Síncrono y barato: lo usa el grafo para reconocer enlaces [[cerebro:id]] */
export function nombresDeCerebros(): Set<string> {
  try {
    return new Set(readdirSync(raiz()).filter((n) => NOMBRE_VALIDO.test(n) && existsSync(join(raiz(), n, ARCHIVO_META))));
  } catch {
    return new Set();
  }
}

export async function listarCerebros(): Promise<MetaCerebro[]> {
  if (!existsSync(raiz())) return [];
  const entradas = await readdir(raiz(), { withFileTypes: true });
  const metas: MetaCerebro[] = [];
  for (const e of entradas) {
    if (!e.isDirectory() || !NOMBRE_VALIDO.test(e.name)) continue;
    if (!existsSync(join(raiz(), e.name, ARCHIVO_META))) continue;
    metas.push(await leerMeta(e.name));
  }
  return metas.sort((a, b) => Number(b.personal) - Number(a.personal) || a.nombre.localeCompare(b.nombre));
}

export async function crearCerebro(nombre: string, descripcion: string, personal = false, repo?: string): Promise<MetaCerebro> {
  const dir = rutaCerebro(nombre);
  if (existsSync(join(dir, ARCHIVO_META))) throw new ErrorNota(`El cerebro "${nombre}" ya existe. Úsalo tal cual o elige otro nombre.`);
  await mkdir(join(dir, 'notas'), { recursive: true });
  const meta: MetaCerebro = { nombre, descripcion, personal, creado: hoy(), repo };
  await guardarMeta(meta);
  await asegurarGitignore(dir);
  await commit(nombre, `cerebro: crea ${nombre}`);
  return meta;
}

/* ── Notas e índice en caché ────────────────────────────────────────── */

interface EntradaIndice {
  mtimeMs: number;
  size: number;
  nota: Nota;
  bolsa: Bolsa;
}

interface Indice {
  version: number;
  notas: Record<string, EntradaIndice>;
}

/**
 * Lee las notas. Cada una se analiza una sola vez: mientras el archivo no cambie (fecha y tamaño), sale del
 * índice en caché junto con sus términos de búsqueda. El índice se puede borrar sin perder nada.
 */
export async function cargarNotas(nombre: string): Promise<{ notas: Map<string, Nota>; errores: string[] }> {
  const raizCerebro = rutaCerebro(nombre);
  const dir = join(raizCerebro, 'notas');
  const notas = new Map<string, Nota>();
  const errores: string[] = [];
  if (!existsSync(dir)) return { notas, errores };

  let indice: Indice = { version: VERSION_INDICE, notas: {} };
  try {
    const leido = JSON.parse(await readFile(join(raizCerebro, ARCHIVO_INDICE), 'utf8')) as Indice;
    if (leido.version === VERSION_INDICE) indice = leido;
  } catch {
    // sin índice o ilegible: se rehace
  }

  const archivos = (await readdir(dir)).filter((a) => a.endsWith('.md'));
  const nuevo: Indice = { version: VERSION_INDICE, notas: {} };
  let cambio = archivos.length !== Object.keys(indice.notas).length;
  await Promise.all(
    archivos.map(async (archivo) => {
      const id = archivo.slice(0, -3);
      try {
        const ruta = join(dir, archivo);
        const { mtimeMs, size } = await stat(ruta);
        const previa = indice.notas[id];
        if (previa && previa.mtimeMs === mtimeMs && previa.size === size) {
          nuevo.notas[id] = previa;
          return;
        }
        const nota = leerNota(id, await readFile(ruta, 'utf8'));
        nuevo.notas[id] = { mtimeMs, size, nota, bolsa: bolsaDe(nota) };
        cambio = true;
      } catch (e) {
        errores.push(e instanceof Error ? e.message : String(e));
      }
    }),
  );
  for (const id of Object.keys(nuevo.notas).sort()) {
    const { nota, bolsa } = nuevo.notas[id];
    recordarBolsa(nota, bolsa);
    notas.set(id, nota);
  }
  if (cambio) {
    try {
      await asegurarGitignore(raizCerebro);
      await escribirAtomico(join(raizCerebro, ARCHIVO_INDICE), JSON.stringify(nuevo));
    } catch {
      // el índice es solo una caché
    }
  }
  return { notas, errores: errores.sort() };
}

export async function guardarNota(nombre: string, nota: Nota): Promise<void> {
  await mkdir(join(rutaCerebro(nombre), 'notas'), { recursive: true });
  await escribirAtomico(rutaNota(nombre, nota.id), escribirNota(nota));
}

export async function borrarArchivoDeNota(nombre: string, id: string): Promise<void> {
  await unlink(rutaNota(nombre, id));
}

// Idempotente: repara el .gitignore de cerebros creados con versiones anteriores
async function asegurarGitignore(dir: string): Promise<void> {
  const ruta = join(dir, '.gitignore');
  const actual = existsSync(ruta) ? await readFile(ruta, 'utf8') : '';
  const faltan = IGNORADOS.filter((p) => !actual.split(/\r?\n/).includes(p));
  if (faltan.length) await writeFile(ruta, `${actual}${actual && !actual.endsWith('\n') ? '\n' : ''}${faltan.join('\n')}\n`, 'utf8');
}

export async function guardarMapa(nombre: string, texto: string): Promise<void> {
  const dir = rutaCerebro(nombre);
  await asegurarGitignore(dir);
  await escribirAtomico(join(dir, ARCHIVO_MAPA), texto);
}

/* ── Bloqueo entre sesiones ─────────────────────────────────────────── */

const BLOQUEO_VIEJO_MS = 12000;
const BLOQUEO_LATIDO_MS = 3000;
const BLOQUEO_ESPERA_MS = 20000;
const enCurso = new Map<string, number>();

/**
 * Una sola escritura a la vez por cerebro, aunque haya varias sesiones de Claude Code abiertas: sin esto dos
 * agentes pueden pisar el mapa o dejar un commit a medias. Reentrante dentro del mismo proceso.
 */
export async function conBloqueo<T>(nombre: string, tarea: () => Promise<T>): Promise<T> {
  const ruta = join(rutaCerebro(nombre), ARCHIVO_BLOQUEO);
  if (enCurso.get(nombre)) {
    enCurso.set(nombre, (enCurso.get(nombre) ?? 0) + 1);
    try {
      return await tarea();
    } finally {
      enCurso.set(nombre, (enCurso.get(nombre) ?? 1) - 1);
    }
  }
  const inicio = Date.now();
  for (;;) {
    try {
      const fh = await open(ruta, 'wx');
      await fh.writeFile(`${process.pid} ${new Date().toISOString()}\n`);
      await fh.close();
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const edad = Date.now() - (await stat(ruta).then((s) => s.mtimeMs, () => Date.now()));
      // un proceso que murió a mitad deja el bloqueo sin renovar: pasado un rato se da por abandonado
      if (edad > BLOQUEO_VIEJO_MS) await rm(ruta, { force: true });
      else if (Date.now() - inicio > BLOQUEO_ESPERA_MS) {
        throw new ErrorNota(
          `Otra sesión está escribiendo en "${nombre}" hace más de ${BLOQUEO_ESPERA_MS / 1000} s. Vuelve a intentarlo en unos segundos; ` +
            `si nadie más lo usa, borra ${ruta}.`,
        );
      } else await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    }
  }
  enCurso.set(nombre, 1);
  // mientras trabaja, renueva la fecha del bloqueo: así una tarea larga no se confunde con una abandonada
  const latido = setInterval(() => void utimes(ruta, new Date(), new Date()).catch(() => undefined), BLOQUEO_LATIDO_MS);
  latido.unref();
  try {
    return await tarea();
  } finally {
    clearInterval(latido);
    enCurso.delete(nombre);
    await rm(ruta, { force: true });
  }
}

/* ── Actividad y uso ────────────────────────────────────────────────── */

export type { Accion };

export interface Evento {
  ts: string;
  accion: Accion;
  notas: string[];
  pid: number;
  /** sesión de Claude Code y proyecto desde donde se llamó */
  sesion?: string;
  proyecto?: string;
  /** lo que se buscó y cuánto se devolvió, para medir si la memoria ayuda */
  consulta?: string;
  tokens?: number;
}

export function sesionActual(): string | undefined {
  return process.env.CLAUDE_CODE_SESSION_ID?.slice(0, 8) || undefined;
}

export function proyectoActual(): string {
  return basename(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
}

/** agente si lo llama Claude Code, persona si alguien lo corre a mano */
export function origenActual(): string {
  return process.env.CLAUDECODE ? 'agente' : 'persona';
}

// La app visual vigila este archivo para encender las neuronas en vivo
export async function registrarActividad(
  nombre: string,
  accion: Accion,
  notas: string[],
  extra: { consulta?: string; tokens?: number } = {},
): Promise<void> {
  const evento: Evento = {
    ts: new Date().toISOString(),
    accion,
    notas,
    pid: process.pid,
    sesion: sesionActual(),
    proyecto: proyectoActual(),
    ...extra,
  };
  try {
    await appendFile(join(rutaCerebro(nombre), ARCHIVO_ACTIVIDAD), `${JSON.stringify(evento)}\n`, 'utf8');
  } catch {
    // la actividad es telemetría local; nunca debe tumbar una lectura
  }
}

export async function leerEventos(nombre: string): Promise<Evento[]> {
  const ruta = join(rutaCerebro(nombre), ARCHIVO_ACTIVIDAD);
  if (!existsSync(ruta)) return [];
  const eventos: Evento[] = [];
  for (const linea of (await readFile(ruta, 'utf8')).split('\n')) {
    if (!linea) continue;
    try {
      eventos.push(JSON.parse(linea) as Evento);
    } catch {
      // línea truncada por una escritura concurrente
    }
  }
  return eventos;
}

async function leerUsoGuardado(nombre: string): Promise<Record<string, Uso>> {
  try {
    return JSON.parse(await readFile(join(rutaCerebro(nombre), ARCHIVO_USO), 'utf8')) as Record<string, Uso>;
  } catch {
    return {};
  }
}

export async function leerUso(nombre: string): Promise<Map<string, Uso>> {
  const uso = new Map<string, Uso>(Object.entries(await leerUsoGuardado(nombre)));
  for (const e of await leerEventos(nombre)) {
    if (e.accion !== 'leer') continue;
    for (const id of e.notas) {
      const u = uso.get(id) ?? { lecturas: 0 };
      uso.set(id, { lecturas: u.lecturas + 1, ultimaLectura: e.ts });
    }
  }
  return uso;
}

/**
 * El registro de actividad no crece sin límite: al pasar el tope, lo viejo se resume en .uso.json (cuántas veces
 * se leyó cada nota) y quedan solo los eventos recientes. Se llama dentro del bloqueo de escritura.
 */
export async function rotarActividad(nombre: string): Promise<boolean> {
  const ruta = join(rutaCerebro(nombre), ARCHIVO_ACTIVIDAD);
  const tamano = await stat(ruta).then((s) => s.size, () => 0);
  if (tamano < ACTIVIDAD_MAXIMA) return false;
  const lineas = (await readFile(ruta, 'utf8')).split('\n').filter(Boolean);
  const viejas = lineas.slice(0, -ACTIVIDAD_CONSERVA);
  const guardado = await leerUsoGuardado(nombre);
  for (const linea of viejas) {
    try {
      const e = JSON.parse(linea) as Evento;
      if (e.accion !== 'leer') continue;
      for (const id of e.notas) guardado[id] = { lecturas: (guardado[id]?.lecturas ?? 0) + 1, ultimaLectura: e.ts };
    } catch {
      // ignorada
    }
  }
  await escribirAtomico(join(rutaCerebro(nombre), ARCHIVO_USO), JSON.stringify(guardado));
  await escribirAtomico(ruta, `${lineas.slice(-ACTIVIDAD_CONSERVA).join('\n')}\n`);
  return true;
}

/* ── Respaldo ───────────────────────────────────────────────────────── */

/**
 * Copia las notas y los ajustes del cerebro a la carpeta de respaldos, una carpeta por día, y conserva las últimas.
 * Protege de borrar o dañar notas; para sobrevivir a un daño del disco la carpeta debe estar en otro disco.
 */
export async function respaldar(nombre: string): Promise<{ destino: string; archivos: number }> {
  const origen = rutaCerebro(nombre);
  const base = join(raizRespaldos(), nombre);
  const destino = join(base, hoy());
  await mkdir(join(destino, 'notas'), { recursive: true });
  let archivos = 0;
  for (const archivo of [ARCHIVO_META, ARCHIVO_PREGUNTAS]) {
    if (!existsSync(join(origen, archivo))) continue;
    await copyFile(join(origen, archivo), join(destino, archivo));
    archivos++;
  }
  for (const archivo of await readdir(join(origen, 'notas')).catch(() => [] as string[])) {
    if (!archivo.endsWith('.md')) continue;
    await copyFile(join(origen, 'notas', archivo), join(destino, 'notas', archivo));
    archivos++;
  }
  const dias = (await readdir(base)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  for (const viejo of dias.slice(0, -RESPALDOS_QUE_SE_GUARDAN)) await rm(join(base, viejo), { recursive: true, force: true });
  await writeFile(join(origen, ARCHIVO_RESPALDO), hoy(), 'utf8');
  return { destino, archivos };
}

/** Un respaldo al día, la primera vez que se escribe: sin tareas programadas ni procesos aparte */
export async function respaldoDiario(nombre: string): Promise<void> {
  try {
    const ultimo = await readFile(join(rutaCerebro(nombre), ARCHIVO_RESPALDO), 'utf8').catch(() => '');
    if (ultimo.trim() !== hoy()) await respaldar(nombre);
  } catch {
    // un respaldo que falla no debe impedir guardar la nota
  }
}

/* ── Git ────────────────────────────────────────────────────────────── */

function git(cwd: string, args: string[]): Promise<{ ok: boolean; salida: string }> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 15000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ ok: !error, salida: `${stdout}${error ? stderr : ''}`.trim() }),
    );
  });
}

// Una operación (add + commit) a la vez: intercaladas, los mensajes no corresponden a su contenido
let colaGit: Promise<unknown> = Promise.resolve();

function enCola<T>(tarea: () => Promise<T>): Promise<T> {
  const siguiente = colaGit.then(tarea, tarea);
  colaGit = siguiente.catch(() => undefined);
  return siguiente;
}

// Historial para deshacer lo que escriba un agente. Si git no está, el cerebro funciona igual.
export function commit(nombre: string, mensaje: string, rutas: string[] = ['-A']): Promise<boolean> {
  const dir = rutaCerebro(nombre);
  return enCola(async () => {
    if (!existsSync(join(dir, '.git')) && !(await git(dir, ['init', '-q'])).ok) return false;
    await git(dir, ['add', ...rutas]);
    return (await git(dir, ['commit', '-q', '-m', mensaje])).ok;
  });
}

export function historialGit(nombre: string, id?: string, cuantos = 15): Promise<string> {
  const dir = rutaCerebro(nombre);
  return enCola(async () => {
    if (!existsSync(join(dir, '.git'))) return '';
    const args = ['log', `-n${cuantos}`, '--date=format:%Y-%m-%d %H:%M', '--pretty=format:%h  %ad  %s'];
    if (id) args.push('--', `notas/${id}.md`);
    return (await git(dir, args)).salida;
  });
}

/** Revierte un cambio con un commit nuevo: nunca reescribe el historial */
export function revertirGit(nombre: string, referencia = 'HEAD'): Promise<{ ok: boolean; salida: string }> {
  const dir = rutaCerebro(nombre);
  return enCola(async () => {
    if (!existsSync(join(dir, '.git'))) return { ok: false, salida: 'Este cerebro no tiene historial de git.' };
    if (!/^[0-9a-f]{4,40}$|^HEAD(~\d+)?$/.test(referencia)) return { ok: false, salida: `Referencia no válida: ${referencia}` };
    const r = await git(dir, ['revert', '--no-edit', referencia]);
    if (!r.ok) await git(dir, ['revert', '--abort']);
    return r;
  });
}
