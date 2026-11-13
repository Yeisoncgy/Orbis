import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';

process.env.CEREBRO_RAIZ = mkdtempSync(join(tmpdir(), 'cerebro-test-'));
process.env.CEREBRO_RESPALDO = mkdtempSync(join(tmpdir(), 'cerebro-respaldo-'));

const { crearCerebro, listarCerebros, rutaCerebro, leerUso } = await import('../src/almacen.ts');
const { abrir, buscar, cambiarEstado, escribir, etiquetar, leer, mapa } = await import('../src/consultas.ts');
const { leerNota, slug } = await import('../src/nota.ts');

before(async () => {
  await crearCerebro('prueba', 'Cerebro de pruebas', true);
  await escribir('prueba', {
    titulo: 'Arquitectura general',
    tipo: 'contexto',
    descripcion: 'Cómo está armado el sistema',
    contenido: 'El backend es Fastify y el frontend es React, en un solo repositorio.',
  });
});

test('slug quita tildes y signos', () => {
  assert.equal(slug('¿Decisión: usar Fastify?'), 'decision-usar-fastify');
});

test('lista el cerebro personal primero', async () => {
  await crearCerebro('otro', 'Otro cerebro');
  const nombres = (await listarCerebros()).map((c) => c.nombre);
  assert.deepEqual(nombres, ['prueba', 'otro']);
});

test('una nota sin enlaces se cuelga del hub de su tipo y sugiere candidatas', async () => {
  const r = await escribir('prueba', {
    titulo: 'Sistema de notas',
    tipo: 'modulo',
    descripcion: 'Parte del sistema que guarda las notas',
    contenido: 'Guarda cada nota como un archivo Markdown dentro del sistema.',
  });
  assert.match(r, /hub Módulos/);
  assert.match(r, /arquitectura-general/);
  const { grafo } = await abrir('prueba');
  assert.ok(grafo.aristas.some((a) => a.origen === 'sistema-de-notas' && a.destino === 'hub:modulo'));
});

test('resuelve enlaces por id o por título y reporta los rotos', async () => {
  const r = await escribir('prueba', {
    titulo: 'Usar Fastify',
    tipo: 'decision',
    descripcion: 'Por qué el backend usa Fastify',
    contenido: 'Ver [[Arquitectura general]] y [[sistema-de-notas|notas]]. Falta [[no-existe]].',
  });
  assert.match(r, /Enlaces que no existen: no-existe/);
  const lectura = await leer('prueba', ['arquitectura-general']);
  assert.match(lectura, /Enlazada desde: usar-fastify/);
});

test('etiquetar pone el tema primero, quita las vagas y no toca contenido, estado ni fecha', async () => {
  await escribir('prueba', {
    titulo: 'Regla de ejemplo',
    tipo: 'convencion',
    descripcion: 'Una regla cualquiera',
    contenido: 'Texto de la regla, con el motivo por el que existe.',
    tags: ['feedback', 'git', 'preferencias'],
    estado: 'consolidada',
  });
  const antes = (await abrir('prueba')).grafo.notas.get('regla-de-ejemplo')!;
  const r = await etiquetar('prueba', { 'regla-de-ejemplo': 'publicacion', 'no-existe': 'trabajo' });
  assert.match(r, /1 notas/);
  assert.match(r, /No existen: no-existe/);
  const nota = (await abrir('prueba')).grafo.notas.get('regla-de-ejemplo')!;
  assert.deepEqual(nota.tags, ['publicacion', 'git']);
  assert.equal(nota.contenido, antes.contenido);
  assert.equal(nota.estado, 'consolidada');
  assert.equal(nota.actualizado, antes.actualizado);
  // repetir no cambia nada
  assert.match(await etiquetar('prueba', { 'regla-de-ejemplo': 'publicacion' }), /0 notas/);
});

test('busca sin importar tildes', async () => {
  const r = await buscar('prueba', 'decision fastify');
  assert.match(r, /\[usar-fastify\]/);
  const r2 = await buscar('prueba', 'armádo');
  assert.match(r2, /\[arquitectura-general\]/);
});

test('el mapa agrupa por tipo y marca recientes', async () => {
  const m = await mapa('prueba');
  assert.match(m, /# Cerebro prueba \(personal\)/);
  assert.match(m, /## Contexto\n- \[arquitectura-general\] Cómo está armado el sistema \(reciente\)/);
  assert.match(m, /## Decisiones/);
  assert.match(m, /nadie las ha revisado/);
});

test('actualizar conserva la fecha de creación y registra lecturas como uso', async () => {
  await escribir('prueba', {
    id: 'arquitectura-general',
    titulo: 'Arquitectura general',
    tipo: 'contexto',
    descripcion: 'Cómo está armado el sistema, versión 2',
    contenido: 'El backend es Fastify, el frontend es React y hay un CLI.',
    estado: 'consolidada',
  });
  const texto = readFileSync(join(rutaCerebro('prueba'), 'notas', 'arquitectura-general.md'), 'utf8');
  const nota = leerNota('arquitectura-general', texto);
  assert.equal(nota.estado, 'consolidada');
  assert.ok(nota.creado);
  assert.equal((await leerUso('prueba')).get('arquitectura-general')?.lecturas, 1);
});

test('obsoleta se oculta del mapa pero se puede leer', async () => {
  await cambiarEstado('prueba', ['sistema-de-notas'], 'obsoleta', 'arquitectura-general');
  const m = await mapa('prueba');
  assert.doesNotMatch(m, /\[sistema-de-notas\]/);
  assert.match(m, /1 obsoletas ocultas/);
  assert.match(await leer('prueba', ['sistema-de-notas']), /Fusionada en \[arquitectura-general\]/);
});

test('leer un id inexistente sugiere parecidas', async () => {
  assert.match(await leer('prueba', ['fastify']), /no existe en prueba\. Quizás: usar-fastify/);
});

test('rechaza nombres e ids que escapan de la carpeta', async () => {
  await assert.rejects(() => mapa('../fuera'), /no válido/);
  const r = await escribir('prueba', {
    id: '../../malo',
    titulo: 'x malo',
    tipo: 'glosario',
    descripcion: 'id con ruta relativa',
    contenido: 'Una nota cuyo id intenta salirse de la carpeta de notas.',
  });
  assert.match(r, /\[malo\]/);
});

test('una nota corrupta no tumba el cerebro', async () => {
  writeFileSync(join(rutaCerebro('prueba'), 'notas', 'rota.md'), 'sin frontmatter', 'utf8');
  const m = await mapa('prueba');
  assert.match(m, /Notas con errores \(no cargadas\): rota: falta el frontmatter/);
});
