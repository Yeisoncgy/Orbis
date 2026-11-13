import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ErrorNota, escribirNota, hoy, leerNota } from './nota.ts';
import type { Accion, MetaCerebro, Nota, Uso } from './tipos.ts';

const NOMBRE_VALIDO = /^[a-z0-9][a-z0-9-]{0,40}$/;
const ID_VALIDO = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ARCHIVO_META = 'cerebro.json';
const ARCHIVO_ACTIVIDAD = '.actividad.jsonl';
const ARCHIVO_MAPA = 'MAPA.md';

export function raiz(): string {
  return process.env.CEREBRO_RAIZ ?? join(homedir(), 'Documents', 'Cerebros');
}

export function rutaCerebro(nombre: string): string {
  if (!NOMBRE_VALIDO.test(nombre)) throw new ErrorNota(`Nombre de cerebro no válido: "${nombre}"`);
  return join(raiz(), nombre);
}

function rutaNota(nombre: string, id: string): string {
  if (!ID_VALIDO.test(id)) throw new ErrorNota(`Id de nota no válido: "${id}"`);
  return join(rutaCerebro(nombre), 'notas', `${id}.md`);
}

async function escribirAtomico(ruta: string, texto: string): Promise<void> {
  const tmp = `${ruta}.${process.pid}.tmp`;
  await writeFile(tmp, texto, 'utf8');
  await rename(tmp, ruta);
}

export async function leerMeta(nombre: string): Promise<MetaCerebro> {
  const ruta = join(rutaCerebro(nombre), ARCHIVO_META);
  if (!existsSync(ruta)) throw new ErrorNota(`No existe el cerebro "${nombre}"`);
  const meta = JSON.parse(await readFile(ruta, 'utf8')) as Partial<MetaCerebro>;
  return {
    nombre,
    descripcion: meta.descripcion ?? '',
    personal: meta.personal === true,
    creado: meta.creado ?? '',
  };
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

export async function crearCerebro(nombre: string, descripcion: string, personal = false): Promise<MetaCerebro> {
  const dir = rutaCerebro(nombre);
  if (existsSync(join(dir, ARCHIVO_META))) throw new ErrorNota(`El cerebro "${nombre}" ya existe`);
  await mkdir(join(dir, 'notas'), { recursive: true });
  const meta: MetaCerebro = { nombre, descripcion, personal, creado: hoy() };
  await writeFile(join(dir, ARCHIVO_META), `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  await asegurarGitignore(dir);
  await commit(nombre, `cerebro: crea ${nombre}`);
  return meta;
}

export async function cargarNotas(nombre: string): Promise<{ notas: Map<string, Nota>; errores: string[] }> {
  const dir = join(rutaCerebro(nombre), 'notas');
  const notas = new Map<string, Nota>();
  const errores: string[] = [];
  if (!existsSync(dir)) return { notas, errores };
  for (const archivo of await readdir(dir)) {
    if (!archivo.endsWith('.md')) continue;
    const id = archivo.slice(0, -3);
    try {
      notas.set(id, leerNota(id, await readFile(join(dir, archivo), 'utf8')));
    } catch (e) {
      errores.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { notas, errores };
}

export async function guardarNota(nombre: string, nota: Nota): Promise<void> {
  await mkdir(join(rutaCerebro(nombre), 'notas'), { recursive: true });
  await escribirAtomico(rutaNota(nombre, nota.id), escribirNota(nota));
}

const IGNORADOS = [ARCHIVO_ACTIVIDAD, ARCHIVO_MAPA, '*.tmp'];

// Idempotente: repara el .gitignore de cerebros creados antes de que existiera MAPA.md
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

export type { Accion };

export interface Evento {
  ts: string;
  accion: Accion;
  notas: string[];
  pid: number;
}

// La app visual vigila este archivo para encender las neuronas en vivo
export async function registrarActividad(nombre: string, accion: Accion, notas: string[]): Promise<void> {
  const evento: Evento = { ts: new Date().toISOString(), accion, notas, pid: process.pid };
  try {
    await appendFile(join(rutaCerebro(nombre), ARCHIVO_ACTIVIDAD), `${JSON.stringify(evento)}\n`, 'utf8');
  } catch {
    // la actividad es telemetría local; nunca debe tumbar una lectura
  }
}

export async function leerUso(nombre: string): Promise<Map<string, Uso>> {
  const uso = new Map<string, Uso>();
  const ruta = join(rutaCerebro(nombre), ARCHIVO_ACTIVIDAD);
  if (!existsSync(ruta)) return uso;
  for (const linea of (await readFile(ruta, 'utf8')).split('\n')) {
    if (!linea) continue;
    try {
      const e = JSON.parse(linea) as Evento;
      if (e.accion !== 'leer') continue;
      for (const id of e.notas) {
        const u = uso.get(id) ?? { lecturas: 0 };
        u.lecturas += 1;
        u.ultimaLectura = e.ts;
        uso.set(id, u);
      }
    } catch {
      // línea truncada por una escritura concurrente
    }
  }
  return uso;
}

function git(cwd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: 15000, windowsHide: true }, (error) => resolve(!error));
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
    if (!existsSync(join(dir, '.git')) && !(await git(dir, ['init', '-q']))) return false;
    await git(dir, ['add', ...rutas]);
    return git(dir, ['commit', '-q', '-m', mensaje]);
  });
}
