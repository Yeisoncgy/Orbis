// El CLI tal como lo usa un agente: un proceso por comando, la nota por la entrada estándar y errores que dicen qué hacer.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'cerebro.ts');
const env = {
  ...process.env,
  CEREBRO_RAIZ: mkdtempSync(join(tmpdir(), 'cerebro-cli-')),
  CEREBRO_RESPALDO: mkdtempSync(join(tmpdir(), 'cerebro-cli-respaldo-')),
};

function cerebro(args: string[], entrada = ''): { salida: string; error: string; codigo: number | null } {
  const r = spawnSync(process.execPath, [CLI, ...args], { env, input: entrada, encoding: 'utf8' });
  return { salida: r.stdout, error: r.stderr, codigo: r.status };
}

const NOTA = `---
titulo: Caché de consultas con vencimiento corto
tipo: decision
descripcion: Las consultas se guardan 10 minutos: antes no vencían y servían datos viejos
tags: [rendimiento]
alias: [cache ttl]
fuente: [src/cache.ts]
---
Se decidió un vencimiento de 10 minutos **porque** la caché sin vencimiento servía datos viejos.
`;

test('sin cerebros dice cómo crear el primero, y la ayuda lista los comandos', () => {
  assert.match(cerebro(['listar']).salida, /No hay cerebros en .*Crea el primero/);
  const ayuda = cerebro([]).salida;
  for (const comando of ['mapa', 'buscar', 'leer', 'vecinos', 'escribir', 'cerrar', 'consolidar', 'evaluar', 'deshacer']) assert.match(ayuda, new RegExp(`\\b${comando} `));
});

test('crea un cerebro, guarda una nota por la entrada estándar y la encuentra', () => {
  assert.match(cerebro(['crear', 'demo', 'Cerebro de demostración del CLI']).salida, /Cerebro "demo" creado/);
  const r = cerebro(['escribir', 'demo'], NOTA);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /Creada \[cache-de-consultas-con-vencimiento-corto\] en demo \(reciente\)/);
  // el YAML con dos puntos dentro de la descripción no rompe la nota
  assert.match(cerebro(['mapa', 'demo']).salida, /Las consultas se guardan 10 minutos: antes no vencían/);
  assert.match(cerebro(['buscar', 'demo', 'cache', 'ttl']).salida, /\[cache-de-consultas-con-vencimiento-corto\]/);
  const breve = cerebro(['leer', 'demo', 'cache-de-consultas-con-vencimiento-corto', '--breve']).salida;
  assert.match(breve, /Fuente: src\/cache\.ts/);
  assert.match(breve, /SIN REVISAR/);
  assert.match(cerebro(['listar']).salida, /- demo: Cerebro de demostración del CLI\nViven en /);
});

test('cada error dice cómo corregirlo y sale con código 1', () => {
  const casos: [string[], string, RegExp][] = [
    [['mapa', 'no-existe'], '', /No existe el cerebro "no-existe".*Los que hay: demo/s],
    [['mapa'], '', /Falta el nombre del cerebro/],
    [['buscar', 'demo'], '', /Faltan las palabras a buscar\. Ejemplo/],
    [['buscar', 'demo', 'algo', '--tipo', 'receta'], '', /Tipo no válido: "receta"\. Usa uno de: contexto/],
    [['buscar', 'demo', 'algo', '--limite'], '', /le falta su valor/],
    [['buscar', 'demo', 'algo', '--limite', 'muchos'], '', /--limite debe ser un número entre 1 y 30/],
    [['leer', 'demo'], '', /Falta al menos un id/],
    [['estado', 'demo', 'archivada', 'x'], '', /Estado no válido: "archivada"\. Usa uno de: reciente, consolidada, obsoleta/],
    [['escribir', 'demo'], 'sin frontmatter', /debe llegar por la entrada estándar con este formato/],
    [['escribir', 'demo'], NOTA, /ya existe \[cache-de-consultas-con-vencimiento-corto\].*agrega `id:/s],
    [['escribir', 'demo'], NOTA.replace('tipo: decision', 'tipo: idea').replace('Caché', 'Otra caché distinta'), /Tipo no válido: "idea"/],
    [['crear', 'Con Mayúsculas', 'una descripción válida'], '', /Nombre de cerebro no válido.*minúsculas/],
    [['importar', 'demo', 'no-hay.json'], '', /No se pudo leer no-hay\.json como JSON/],
  ];
  for (const [args, entrada, patron] of casos) {
    const r = cerebro(args, entrada);
    assert.equal(r.codigo, 1, `${args.join(' ')} debía fallar`);
    assert.match(r.error, patron, args.join(' '));
    assert.doesNotMatch(r.error, /Error interno/, args.join(' '));
  }
});

test('cerrar guarda varias notas y consolidar las propone', () => {
  const lote = `${NOTA.replace('Caché de consultas con vencimiento corto', 'Los pedidos se numeran por año').replace('alias: [cache ttl]\n', '')}===\n${NOTA.replace('Caché de consultas con vencimiento corto', 'El panel solo se abre desde la oficina').replace('alias: [cache ttl]\n', '')}`;
  const r = cerebro(['cerrar', 'demo'], lote);
  assert.equal(r.codigo, 0, r.error);
  assert.match(r.salida, /2 de 2 notas guardadas como recientes/);
  assert.match(cerebro(['consolidar', 'demo']).salida, /3 notas sin revisar/);
  assert.match(cerebro(['estado', 'demo', 'consolidada', 'los-pedidos-se-numeran-por-ano']).salida, /Marcadas consolidada/);
  assert.match(cerebro(['verificar', 'demo']).salida, /Sin revisar \(2\)/);
  assert.match(cerebro(['historial', 'demo']).salida, /agrega los-pedidos-se-numeran-por-ano/);
});
