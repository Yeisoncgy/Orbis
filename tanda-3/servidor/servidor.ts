// Servidor local de la app visual. Solo lectura, solo 127.0.0.1.
//   node servidor/servidor.ts [--abrir]
// El único proceso que lanza es el navegador predeterminado (explorer.exe <url>) con --abrir.
import { execFile } from 'node:child_process';
import { existsSync, watch, type FSWatcher } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerUso, listarCerebros, leerMeta, raiz, rutaCerebro } from '../core/src/almacen.ts';
import { abrir, puntuar } from '../core/src/consultas.ts';
import { indiceDeNotas, resolverEnlace, salientesDe } from '../core/src/grafo.ts';
import { ErrorNota } from '../core/src/nota.ts';
import type { Nota } from '../core/src/tipos.ts';
import type { CerebroApi, EventoApi, GrafoApi, NodoApi, NotaApi, ResultadoApi, VecinoApi } from './api-tipos.ts';

const PUERTO = Number(process.env.CEREBRO_PUERTO ?? 4810);
const HOST = '127.0.0.1';
const URL_APP = `http://${HOST}:${PUERTO}`;
const ESTATICOS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'app');
const ARCHIVO_ACTIVIDAD = '.actividad.jsonl';
const FIRMA = 'cerebro-app';
// Con el lanzador sin ventana (scripts/abrir-oculto.js) nadie puede cerrar la consola: el servidor se apaga
// solo tras este tiempo sin ninguna pestana conectada a /api/eventos. Sin la variable no se apaga nunca.
const APAGAR_SIN_PESTANAS_MS = Number(process.env.CEREBRO_APAGAR_SIN_PESTANAS_MS) || 0;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function json(res: ServerResponse, codigo: number, cuerpo: unknown): void {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
}

function nodoDe(nota: Nota, lecturas = 0, ultimaLectura?: string): NodoApi {
  return {
    id: nota.id,
    titulo: nota.titulo,
    tipo: nota.tipo,
    descripcion: nota.descripcion,
    estado: nota.estado,
    tags: nota.tags,
    creado: nota.creado,
    actualizado: nota.actualizado,
    fusionadaEn: nota.fusionadaEn,
    lecturas,
    ultimaLectura,
  };
}

async function cerebros(): Promise<CerebroApi[]> {
  const metas = await listarCerebros();
  return Promise.all(
    metas.map(async (m) => {
      const { grafo } = await abrir(m.nombre);
      const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta');
      return { ...m, notas: vivas.length, recientes: vivas.filter((n) => n.estado === 'reciente').length };
    }),
  );
}

async function grafoDe(nombre: string): Promise<GrafoApi> {
  const meta = await leerMeta(nombre);
  const { grafo, errores } = await abrir(nombre);
  const uso = await leerUso(nombre);
  return {
    meta,
    nodos: [...grafo.notas.values()].map((n) => nodoDe(n, uso.get(n.id)?.lecturas, uso.get(n.id)?.ultimaLectura)),
    aristas: grafo.aristas,
    rotos: [...grafo.rotos.values()].reduce((s, r) => s + r.length, 0),
    errores,
  };
}

async function notaDe(nombre: string, id: string): Promise<NotaApi> {
  const { grafo } = await abrir(nombre);
  const nota = grafo.notas.get(id);
  if (!nota) throw new ErrorNota(`No existe la nota [${id}]`);
  const uso = (await leerUso(nombre)).get(id);
  const indice = indiceDeNotas(grafo.notas);
  const vecino = (v: string): VecinoApi[] => {
    const n = grafo.notas.get(v);
    return n ? [{ id: n.id, titulo: n.titulo, tipo: n.tipo }] : [];
  };
  const enlaces: Record<string, string> = {};
  for (const e of nota.enlaces) {
    const destino = resolverEnlace(grafo.notas, indice, e);
    if (destino) enlaces[e] = destino;
  }
  return {
    ...nodoDe(nota, uso?.lecturas, uso?.ultimaLectura),
    contenido: nota.contenido,
    salientes: [...new Set(salientesDe(grafo, id))].flatMap(vecino),
    entrantes: [...new Set(grafo.entrantes.get(id) ?? [])].flatMap(vecino),
    enlaces,
  };
}

async function buscarEn(nombre: string, q: string): Promise<ResultadoApi[]> {
  const { grafo } = await abrir(nombre);
  // La app no registra actividad: el refuerzo mide lo que leen los agentes, no lo que mira la persona
  return puntuar(grafo, q, undefined, 12).map(({ puntaje: _, ...r }) => r);
}

async function actividadDe(nombre: string, limite: number): Promise<EventoApi[]> {
  const ruta = join(rutaCerebro(nombre), ARCHIVO_ACTIVIDAD);
  if (!existsSync(ruta)) return [];
  const lineas = (await readFile(ruta, 'utf8')).split('\n').filter(Boolean).slice(-limite);
  const eventos: EventoApi[] = [];
  for (const l of lineas) {
    try {
      eventos.push({ cerebro: nombre, ...(JSON.parse(l) as Omit<EventoApi, 'cerebro'>) });
    } catch {
      // línea truncada
    }
  }
  return eventos.reverse();
}

/* ── Actividad en vivo (Server-Sent Events) ─────────────────────────── */

const clientes = new Set<ServerResponse>();
const vigilados = new Map<string, { watcher: FSWatcher; desde: number; leyendo: boolean; pendiente: boolean }>();

function emitir(evento: EventoApi): void {
  const datos = `data: ${JSON.stringify(evento)}\n\n`;
  for (const c of clientes) c.write(datos);
}

async function leerNuevo(nombre: string): Promise<void> {
  const v = vigilados.get(nombre);
  if (!v) return;
  if (v.leyendo) {
    v.pendiente = true;
    return;
  }
  v.leyendo = true;
  try {
    const ruta = join(rutaCerebro(nombre), ARCHIVO_ACTIVIDAD);
    const { size } = await stat(ruta);
    if (size < v.desde) v.desde = 0;
    if (size > v.desde) {
      const fh = await open(ruta, 'r');
      const buffer = Buffer.alloc(size - v.desde);
      await fh.read(buffer, 0, buffer.length, v.desde);
      await fh.close();
      const texto = buffer.toString('utf8');
      // solo líneas completas: la última puede estar a medio escribir
      const corte = texto.lastIndexOf('\n') + 1;
      v.desde += Buffer.byteLength(texto.slice(0, corte));
      for (const l of texto.slice(0, corte).split('\n').filter(Boolean)) {
        try {
          emitir({ cerebro: nombre, ...(JSON.parse(l) as Omit<EventoApi, 'cerebro'>) });
        } catch {
          // ignorada
        }
      }
    }
  } catch {
    // el archivo aún no existe
  } finally {
    v.leyendo = false;
    if (v.pendiente) {
      v.pendiente = false;
      void leerNuevo(nombre);
    }
  }
}

async function vigilarCerebros(): Promise<void> {
  for (const { nombre } of await listarCerebros()) {
    if (vigilados.has(nombre)) continue;
    const dir = rutaCerebro(nombre);
    const ruta = join(dir, ARCHIVO_ACTIVIDAD);
    const desde = existsSync(ruta) ? (await stat(ruta)).size : 0;
    const watcher = watch(dir, (_, archivo) => {
      if (archivo === ARCHIVO_ACTIVIDAD) void leerNuevo(nombre);
    });
    vigilados.set(nombre, { watcher, desde, leyendo: false, pendiente: false });
  }
}

/* ── HTTP ───────────────────────────────────────────────────────────── */

// Evita que una página web cualquiera lea los cerebros vía DNS rebinding
function hostPermitido(req: IncomingMessage): boolean {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '');
  return host === HOST || host === 'localhost';
}

async function estatico(res: ServerResponse, ruta: string): Promise<void> {
  let archivo = normalize(join(ESTATICOS, decodeURIComponent(ruta)));
  if (!archivo.startsWith(ESTATICOS + sep) && archivo !== ESTATICOS) return json(res, 403, { error: 'Prohibido' });
  if (!existsSync(archivo) || (await stat(archivo)).isDirectory()) archivo = join(ESTATICOS, 'index.html');
  if (!existsSync(archivo)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('La app no está compilada. Corre: npm run app');
    return;
  }
  const inmutable = archivo.includes(`${sep}assets${sep}`);
  res.writeHead(200, {
    'Content-Type': MIME[extname(archivo)] ?? 'application/octet-stream',
    'Cache-Control': inmutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  res.end(await readFile(archivo));
}

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const partes = url.pathname.split('/').filter(Boolean).slice(1).map(decodeURIComponent);
  if (partes[0] === 'salud') return json(res, 200, { app: FIRMA });
  if (partes[0] === 'eventos') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': conectado\n\n');
    clientes.add(res);
    const latido = setInterval(() => res.write(': latido\n\n'), 25000);
    req.on('close', () => {
      clearInterval(latido);
      clientes.delete(res);
    });
    void vigilarCerebros();
    return;
  }
  if (partes[0] !== 'cerebros') return json(res, 404, { error: 'No existe' });
  const [, nombre, recurso, id] = partes;
  if (!nombre) return json(res, 200, await cerebros());
  if (recurso === 'grafo') return json(res, 200, await grafoDe(nombre));
  if (recurso === 'notas' && id) return json(res, 200, await notaDe(nombre, id));
  if (recurso === 'buscar') return json(res, 200, await buscarEn(nombre, url.searchParams.get('q') ?? ''));
  if (recurso === 'actividad') return json(res, 200, await actividadDe(nombre, Math.min(Number(url.searchParams.get('limite') ?? 30), 200)));
  return json(res, 404, { error: 'No existe' });
}

const servidor = createServer(async (req, res) => {
  try {
    if (!hostPermitido(req)) return json(res, 403, { error: 'Host no permitido' });
    if (req.method !== 'GET') return json(res, 405, { error: 'Solo lectura' });
    const url = new URL(req.url ?? '/', URL_APP);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return await estatico(res, url.pathname);
  } catch (e) {
    json(res, e instanceof ErrorNota ? 404 : 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

function abrirNavegador(): void {
  if (!process.argv.includes('--abrir')) return;
  execFile('explorer.exe', [URL_APP], { windowsHide: true }, () => undefined);
}

servidor.on('error', async (e: NodeJS.ErrnoException) => {
  if (e.code !== 'EADDRINUSE') throw e;
  // Si el puerto lo tiene otra instancia de Cerebro, basta con abrir el navegador
  try {
    const r = await fetch(`${URL_APP}/api/salud`);
    if (((await r.json()) as { app?: string }).app === FIRMA) {
      console.log(`Orbis ya está abierto en ${URL_APP}`);
      abrirNavegador();
      return;
    }
  } catch {
    // no responde
  }
  console.error(`El puerto ${PUERTO} está ocupado por otra aplicación. Usa otro: set CEREBRO_PUERTO=4811`);
  process.exitCode = 1;
});

function apagarSinPestanas(): void {
  if (APAGAR_SIN_PESTANAS_MS <= 0) return;
  let ultimaPestana = Date.now();
  setInterval(() => {
    if (clientes.size > 0) ultimaPestana = Date.now();
    else if (Date.now() - ultimaPestana >= APAGAR_SIN_PESTANAS_MS) {
      for (const v of vigilados.values()) v.watcher.close();
      servidor.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 3000).unref();
    }
  }, Math.min(15000, APAGAR_SIN_PESTANAS_MS / 4)).unref();
}

servidor.listen(PUERTO, HOST, async () => {
  await vigilarCerebros();
  console.log(`Orbis abierto en ${URL_APP}  (cerebros en ${raiz()})`);
  console.log('Cierra esta ventana para apagarlo.');
  abrirNavegador();
  apagarSinPestanas();
});
