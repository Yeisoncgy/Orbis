// El servidor de la app: solo lectura, solo este equipo.
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const PUERTO = 4700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PUERTO}`;
process.env.CEREBRO_RAIZ = mkdtempSync(join(tmpdir(), 'cerebro-servidor-'));
process.env.CEREBRO_RESPALDO = mkdtempSync(join(tmpdir(), 'cerebro-servidor-respaldo-'));

const { crearCerebro } = await import('../../core/src/almacen.ts');
const { escribir } = await import('../../core/src/consultas.ts');

let servidor: ChildProcess;

before(async () => {
  await crearCerebro('visible', 'Cerebro que la app muestra');
  await escribir('visible', { titulo: 'Nota de ejemplo', tipo: 'contexto', descripcion: 'Una nota para la app', contenido: 'Contenido de ejemplo con [[otra-nota]] que no existe.' });
  servidor = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), '..', 'servidor.ts')], {
    env: { ...process.env, CEREBRO_PUERTO: String(PUERTO) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/api/salud`)).ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error('el servidor no arrancó');
});

after(() => {
  servidor?.kill();
});

test('entrega cerebros, grafo, nota y búsqueda', async () => {
  const cerebros = (await (await fetch(`${BASE}/api/cerebros`)).json()) as { nombre: string; notas: number; recientes: number }[];
  assert.deepEqual(cerebros.map((c) => [c.nombre, c.notas, c.recientes]), [['visible', 1, 1]]);
  const grafo = (await (await fetch(`${BASE}/api/cerebros/visible/grafo`)).json()) as { nodos: { id: string }[]; rotos: number };
  assert.equal(grafo.nodos[0].id, 'nota-de-ejemplo');
  assert.equal(grafo.rotos, 1);
  const nota = (await (await fetch(`${BASE}/api/cerebros/visible/notas/nota-de-ejemplo`)).json()) as { contenido: string };
  assert.match(nota.contenido, /Contenido de ejemplo/);
  const resultados = (await (await fetch(`${BASE}/api/cerebros/visible/buscar?q=ejemplo`)).json()) as { id: string }[];
  assert.equal(resultados[0].id, 'nota-de-ejemplo');
  assert.equal((await fetch(`${BASE}/api/cerebros/visible/notas/no-existe`)).status, 404);
});

test('no acepta escrituras, otros nombres de equipo ni rutas fuera de la app', async () => {
  assert.equal((await fetch(`${BASE}/api/cerebros`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${BASE}/api/cerebros/visible/notas/nota-de-ejemplo`, { method: 'DELETE' })).status, 405);
  // una página web cualquiera no puede leer los cerebros haciéndose pasar por otro nombre (DNS rebinding)
  const codigo = await new Promise<number>((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port: PUERTO, path: '/api/cerebros', headers: { Host: 'sitio-malo.example' } }, (res) => resolve(res.statusCode ?? 0));
    r.on('error', reject);
    r.end();
  });
  assert.equal(codigo, 403);
  const fuera = await fetch(`${BASE}/..%2f..%2fpackage.json`);
  assert.doesNotMatch(await fuera.text(), /"scripts"/);
});
