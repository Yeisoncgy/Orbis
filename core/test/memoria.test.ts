// Lo que hace de un cerebro una memoria fiable: encontrar, no gastar de más, no guardar basura y no envejecer en silencio.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';

process.env.CEREBRO_RAIZ = mkdtempSync(join(tmpdir(), 'cerebro-memoria-'));
process.env.CEREBRO_RESPALDO = mkdtempSync(join(tmpdir(), 'cerebro-respaldo-'));

const { conBloqueo, crearCerebro, leerUso, raizRespaldos, rotarActividad, rutaCerebro } = await import('../src/almacen.ts');
const { abrir, buscar, cambiarEstado, cerrar, escribir, importarLote, leer, mapa, vecinos } = await import('../src/consultas.ts');
const { importarMemoria, importarObsidian, sembrar } = await import('../src/importadores.ts');
const { agregarPregunta, comprobar, consolidar, deshacer, evaluar, historial, metricas, podar, renombrar, verificar } = await import(
  '../src/mantenimiento.ts'
);
const { raizDe, terminos } = await import('../src/texto.ts');
const { buscarSecretos } = await import('../src/reglas.ts');

const nota = (titulo: string, tipo: string, descripcion: string, contenido: string, extra: Record<string, unknown> = {}) =>
  ({ titulo, tipo, descripcion, contenido, estado: 'consolidada', ...extra }) as Parameters<typeof escribir>[1];

before(async () => {
  await crearCerebro('tienda', 'Tienda en línea de ejemplo');
  await importarLote('tienda', [
    nota('Despliegue en Vercel', 'convencion', 'Cómo se publica una versión en producción', 'Se publica desde main con [[Integración continua]]. Las migraciones van antes de la web.', {
      tags: ['operacion'],
      alias: ['puesta en producción'],
    }),
    nota('Integración continua', 'modulo', 'Pruebas y guardas que corren en cada push', 'GitHub Actions corre las pruebas y el empaquetado. Ver [[Despliegue en Vercel]].', { tags: ['operacion'] }),
    nota('Descuento comercial', 'modulo', 'Un descuento del 1 % al 10 % que pide un vendedor y aprueba un administrador', 'El vendedor lo pide y solo un admin lo aprueba. Guarda `discount_requests`.', {
      tags: ['precios'],
    }),
    nota('Respaldo semanal', 'convencion', 'Copia de la base de producción cada lunes', 'Un pg_dump cada lunes; se guarda 90 días. No incluye los archivos subidos.', { tags: ['operacion'] }),
    nota('Cotizaciones retenidas', 'modulo', 'Una cotización sobre el tope queda sin precio hasta que el equipo la confirme', 'El comprador ve la pieza pero ningún precio. Tiene que ver con [[Descuento comercial]].', {
      tags: ['precios'],
    }),
  ]);
});

test('la raíz de las palabras une conjugaciones y plurales', () => {
  assert.equal(raizDe('cotizaciones'), raizDe('cotizar'));
  assert.equal(raizDe('cotizado'), raizDe('cotiza'));
  assert.equal(raizDe('clientes'), raizDe('cliente'));
  assert.equal(raizDe('aliados'), raizDe('aliada'));
  // un identificador de código se busca entero y por partes
  assert.deepEqual(terminos('quote_requests'), ['quote_requests', raizDe('quote'), raizDe('requests')]);
  assert.ok(terminos('computeQuotes').includes('computequotes'));
});

test('la búsqueda ordena por relevancia, no por apariciones de una subcadena', async () => {
  // «cotizar» encuentra «cotizaciones»; el título pesa más que el cuerpo
  assert.match((await buscar('tienda', 'cotizar')).split('\n')[0], /\[cotizaciones-retenidas\]/);
  // sinónimo de uso común: copia de seguridad = respaldo
  assert.match((await buscar('tienda', 'copia de seguridad')).split('\n')[0], /\[respaldo-semanal\]/);
  // el alias de la nota
  assert.match((await buscar('tienda', 'puesta en producción')).split('\n')[0], /\[despliegue-en-vercel\]/);
  // «rol» no coincide con «control» ni «admin» con nada parcial
  assert.match(await buscar('tienda', 'rol'), /Sin resultados/);
  // identificador de código y frase exacta
  assert.match(await buscar('tienda', 'discount_requests'), /\[descuento-comercial\]/);
  assert.match(await buscar('tienda', '"cada lunes"'), /\[respaldo-semanal\]/);
  assert.match(await buscar('tienda', '"cada martes"'), /Sin resultados/);
});

test('los filtros acotan y una búsqueda vacía dice qué hacer', async () => {
  assert.doesNotMatch(await buscar('tienda', 'descuento vendedor', { tipo: 'convencion' }), /\[descuento-comercial\]/);
  assert.match(await buscar('tienda', 'publicar pruebas', { tag: 'operacion' }), /\[integracion-continua\]/);
  assert.match(await buscar('tienda', 'publicar', { desde: '2999-01-01' }), /Sin resultados/);
  const vacia = await buscar('tienda', 'zzzqqq');
  assert.match(vacia, /Sin resultados/);
  assert.match(vacia, /alias/);
  // una errata encuentra la palabra parecida
  assert.match(await buscar('tienda', 'desplieges'), /\[despliegue-en-vercel\]/);
});

test('leer en breve o por sección gasta menos, y vecinos muestra el contorno', async () => {
  const completa = await leer('tienda', ['despliegue-en-vercel']);
  const breve = await leer('tienda', ['despliegue-en-vercel'], { breve: true });
  assert.match(breve, /Cómo se publica una versión/);
  assert.doesNotMatch(breve, /Las migraciones van antes/);
  assert.match(completa, /Las migraciones van antes/);
  await escribir('tienda', nota('Motor de precios', 'modulo', 'Cómo se calcula un precio', '## Fórmula\nPeso por tarifa.\n\n## Por qué\nPorque replica la hoja de Excel del cliente.'));
  assert.match(await leer('tienda', ['motor-de-precios'], { seccion: 'por qué' }), /replica la hoja/);
  assert.doesNotMatch(await leer('tienda', ['motor-de-precios'], { seccion: 'por qué' }), /Peso por tarifa/);
  assert.match(await leer('tienda', ['motor-de-precios'], { seccion: 'no hay' }), /Secciones: Fórmula \| Por qué/);
  const cerca = await vecinos('tienda', 'descuento-comercial');
  assert.match(cerca, /\[cotizaciones-retenidas\]/);
  await assert.rejects(() => vecinos('tienda', 'no-existe'), /no existe en tienda/);
});

test('una lectura breve no cuenta como uso; una completa sí', async () => {
  const antes = (await leerUso('tienda')).get('respaldo-semanal')?.lecturas ?? 0;
  await leer('tienda', ['respaldo-semanal'], { breve: true });
  assert.equal((await leerUso('tienda')).get('respaldo-semanal')?.lecturas ?? 0, antes);
  await leer('tienda', ['respaldo-semanal']);
  assert.equal((await leerUso('tienda')).get('respaldo-semanal')?.lecturas, antes + 1);
});

test('el mapa respeta su presupuesto: si no cabe, es un índice por temas', async () => {
  await crearCerebro('grande', 'Cerebro con muchas notas');
  await importarLote(
    'grande',
    Array.from({ length: 120 }, (_, i) =>
      nota(`Nota número ${i} sobre ${i % 2 ? 'precios' : 'geometría'}`, i % 3 ? 'modulo' : 'decision', `Descripción suficientemente larga de la nota ${i} para que el mapa completo no quepa`, `Contenido de la nota ${i}, con su explicación.`, {
        tags: [i % 2 ? 'precios' : 'geometria'],
      }),
    ),
  );
  const raizMapa = await mapa('grande');
  assert.match(raizMapa, /Índice por temas/);
  assert.match(raizMapa, /- modulo\/precios · \d+ notas/);
  assert.ok(raizMapa.length / 3.5 <= 3000, `el mapa raíz pasa del presupuesto: ${Math.round(raizMapa.length / 3.5)}`);
  const tema = await mapa('grande', 'decision/geometria');
  assert.match(tema, /\[nota-numero-0-sobre-geometria\]/);
  assert.doesNotMatch(tema, /sobre-precios\]/);
  await assert.rejects(() => mapa('grande', 'no-hay'), /Temas que sí existen/);
  // el mapa guardado para CLAUDE.md es el raíz, no el del tema
  assert.match(readFileSync(join(rutaCerebro('grande'), 'MAPA.md'), 'utf8'), /Índice por temas/);
});

test('no guarda secretos, descripciones eternas ni notas vacías', async () => {
  const base = { titulo: 'Acceso al panel', tipo: 'convencion', descripcion: 'Cómo se entra al panel' } as const;
  await assert.rejects(() => escribir('tienda', { ...base, contenido: 'La clave de servicio es sk-abcdefghijklmnopqrstuvwxyz123456 y va en el servidor.' }), /secreto/);
  await assert.rejects(() => escribir('tienda', { ...base, contenido: 'Se entra con password: Hunter2secreto99 desde la oficina.' }), /secreto/);
  await assert.rejects(() => escribir('tienda', { ...base, contenido: 'Conexión postgres://admin:s3cretoLargo@db.ejemplo.com:5432/app para el panel.' }), /secreto/);
  await assert.rejects(() => escribir('tienda', { ...base, descripcion: 'x'.repeat(201), contenido: 'Una nota con una descripción demasiado larga.' }), /máximo es 200/);
  await assert.rejects(() => escribir('tienda', { ...base, contenido: 'corta' }), /casi no tiene contenido/);
  // hablar de dónde vive un secreto sí se puede
  assert.deepEqual(buscarSecretos('La contraseña vive en .env.local y el token se rota cada mes.'), []);
  assert.deepEqual(buscarSecretos('password: <tu_clave>'), []);
  assert.match(await escribir('tienda', { ...base, contenido: 'La clave vive en .env.local; nunca en el repositorio.' }), /Creada \[acceso-al-panel\]/);
});

test('regla de admisión: una idea, una nota', async () => {
  // el mismo título sin `id` no sobrescribe lo que ya había
  await assert.rejects(
    () => escribir('tienda', { titulo: 'Despliegue en Vercel', tipo: 'convencion', descripcion: 'Otra vez lo mismo', contenido: 'Se publica desde main, como ya se dijo.' }),
    /ya existe \[despliegue-en-vercel\].*agrega `id: despliegue-en-vercel`/s,
  );
  assert.match(await leer('tienda', ['despliegue-en-vercel']), /Las migraciones van antes/);
  // casi el mismo título tampoco entra como nota nueva
  await assert.rejects(
    () => escribir('tienda', { titulo: 'Despliegues en Vercel', tipo: 'convencion', descripcion: 'Otra vez lo mismo', contenido: 'Se publica desde main, como ya se dijo.' }),
    /ya existe \[despliegue-en-vercel\].*casi el mismo título/s,
  );
  const r = await escribir('tienda', {
    titulo: 'Publicar en producción desde main',
    tipo: 'convencion',
    descripcion: 'Cómo se publica una versión en producción desde main',
    contenido: 'Se publica desde main cuando las pruebas pasan; las migraciones van antes de la web.',
  });
  assert.match(r, /Se parece a: .*despliegue-en-vercel/);
  assert.match(r, /contradice/);
  // con --forzar entra aunque el título sea casi el mismo
  assert.match(await escribir('tienda', { titulo: 'Despliegue en Vercel', id: 'despliegue-en-vercel-2', tipo: 'convencion', descripcion: 'Variante para previews', contenido: 'Los previews se publican en cada rama, sin migraciones.', forzar: true }), /Creada/);
});

test('una nota guarda de dónde sale, quién la escribió y hasta cuándo vale', async () => {
  await escribir('tienda', {
    titulo: 'Promoción de fin de año',
    tipo: 'estado',
    descripcion: 'Envío gratis hasta fin de año',
    contenido: 'Envío gratis en todos los pedidos durante la promoción de fin de año.',
    fuente: ['docs/promos.md'],
    validoHasta: '2020-12-31',
    relaciones: { depende_de: ['descuento-comercial'] },
  });
  const n = (await abrir('tienda')).grafo.notas.get('promocion-de-fin-de-ano')!;
  assert.deepEqual(n.fuente, ['docs/promos.md']);
  assert.ok(n.origen === 'agente' || n.origen === 'persona');
  assert.ok(n.verificado);
  const lectura = await leer('tienda', ['promocion-de-fin-de-ano']);
  assert.match(lectura, /VENCIDA desde 2020-12-31/);
  assert.match(lectura, /SIN REVISAR/);
  assert.match(lectura, /Fuente: docs\/promos\.md/);
  assert.match(lectura, /Depende de: descuento-comercial/);
  assert.match(await mapa('tienda'), /\[promocion-de-fin-de-ano\].*\(reciente, vencida\)/);
  assert.match(await verificar('tienda'), /Vencidas \(1\): promocion-de-fin-de-ano/);
});

test('consolidar propone, y consolidar una nota la deja verificada', async () => {
  const propuesta = await consolidar('tienda');
  assert.match(propuesta, /\[publicar-en-produccion-desde-main\]/);
  assert.match(propuesta, /Se parece a: .*despliegue-en-vercel/);
  assert.match(propuesta, /venció el 2020-12-31/);
  await cambiarEstado('tienda', ['acceso-al-panel'], 'consolidada');
  assert.doesNotMatch(await leer('tienda', ['acceso-al-panel']), /SIN REVISAR/);
});

test('reemplaza y contradice se ven al leer', async () => {
  await escribir('tienda', nota('Despliegue con contenedores', 'convencion', 'Desde 2027 se publica con contenedores', 'Se publica con contenedores; ya no se usa la plataforma anterior.', { relaciones: { reemplaza: ['despliegue-en-vercel'], contradice: ['integracion-continua'] } }));
  assert.match(await leer('tienda', ['despliegue-en-vercel']), /Reemplazada por: despliegue-con-contenedores/);
  assert.match(await leer('tienda', ['integracion-continua']), /En conflicto con: despliegue-con-contenedores/);
  assert.match(await verificar('tienda'), /Contradicciones sin resolver: despliegue-con-contenedores ↔ integracion-continua/);
});

test('renombrar reescribe los enlaces y deja el título viejo como alias', async () => {
  const r = await renombrar('tienda', 'integracion-continua', 'Canal de pruebas automáticas');
  assert.match(r, /ahora es \[canal-de-pruebas-automaticas\]/);
  const { grafo } = await abrir('tienda');
  assert.ok(!grafo.notas.has('integracion-continua'));
  assert.match(grafo.notas.get('despliegue-en-vercel')!.contenido, /\[\[canal-de-pruebas-automaticas\]\]/);
  assert.deepEqual(grafo.notas.get('despliegue-con-contenedores')!.relaciones?.contradice, ['canal-de-pruebas-automaticas']);
  assert.equal(grafo.rotos.size, 0);
  // el nombre viejo sigue sirviendo para leer y para buscar
  assert.match(await leer('tienda', ['Integración continua']), /# Canal de pruebas automáticas/);
  await assert.rejects(() => renombrar('tienda', 'respaldo-semanal', 'Descuento comercial'), /Ya existe/);
});

test('comprobar marca las notas que citan archivos que ya no existen', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'cerebro-repo-'));
  mkdirSync(join(repo, 'apps', 'web', 'src'), { recursive: true });
  writeFileSync(join(repo, 'apps', 'web', 'src', 'precio.ts'), 'export {}');
  await escribir('tienda', nota('Cálculo del precio', 'modulo', 'Dónde vive el cálculo', 'El cálculo está en `src/precio.ts` y antes estaba en `src/viejo/costos.ts`.', { fuente: ['apps/web/src/precio.ts'] }));
  const informe = await comprobar('tienda', repo, true);
  assert.match(informe, /\[calculo-del-precio\] ya no existen: src\/viejo\/costos\.ts/);
  assert.doesNotMatch(informe, /src\/precio\.ts,/);
  assert.match(await leer('tienda', ['calculo-del-precio']), /POR REVISAR: cita rutas que ya no existen/);
  // corregida la nota, la marca se va; y el repo queda recordado
  await escribir('tienda', nota('Cálculo del precio', 'modulo', 'Dónde vive el cálculo', 'El cálculo está en `src/precio.ts`, junto a sus pruebas.', { id: 'calculo-del-precio' }));
  assert.doesNotMatch(await comprobar('tienda', undefined, true), /calculo-del-precio/);
  assert.doesNotMatch(await leer('tienda', ['calculo-del-precio']), /POR REVISAR/);
});

test('cerrar guía sin texto y guarda varias notas con texto', async () => {
  assert.match(await cerrar('tienda', ''), /guarda SOLO lo que una sesión futura necesitaría/);
  const r = await cerrar(
    'tienda',
    [
      '---\ntitulo: El pago falla con tarjetas de prueba vencidas\ntipo: contexto\ndescripcion: La pasarela rechaza tarjetas de prueba de más de un año\n---\nCostó una tarde: la pasarela las rechaza sin decir por qué.',
      '---\ntitulo: Sin tipo\ndescripcion: le falta el tipo\n---\nEsta no entra porque no dice de qué tipo es.',
    ].join('\n===\n'),
  );
  assert.match(r, /Creada \[el-pago-falla-con-tarjetas-de-prueba-vencidas\] en tienda \(reciente\)/);
  assert.match(r, /Nota 2 no guardada: Falta "tipo"/);
  assert.match(r, /1 de 2 notas guardadas/);
});

test('el banco de preguntas mide la búsqueda y las métricas muestran lo que no se encontró', async () => {
  assert.match(await evaluar('tienda'), /no tiene banco de preguntas/);
  await agregarPregunta('tienda', 'cómo se hace la copia de seguridad', ['respaldo-semanal']);
  await agregarPregunta('tienda', 'cotizar sin precio', ['Cotizaciones retenidas']);
  await assert.rejects(() => agregarPregunta('tienda', 'algo', ['no-existe']), /no existe en tienda/);
  const medida = await evaluar('tienda');
  assert.match(medida, /sobre 2 preguntas/);
  assert.match(medida, /sale de primera: 100 %/);
  await buscar('tienda', 'zzzqqq');
  const uso = await metricas('tienda');
  assert.match(uso, /Búsquedas sin resultado/);
  assert.match(uso, /"zzzqqq"/);
  assert.match(uso, /Notas leídas alguna vez: \d+ de \d+/);
  assert.match(await podar('tienda', 1), /Vencidas \(1\)/);
});

test('historial y deshacer devuelven una nota a como estaba', async () => {
  await escribir('tienda', nota('Respaldo semanal', 'convencion', 'Copia de la base de producción cada lunes', 'Texto cambiado por error, que no debía quedar así.', { id: 'respaldo-semanal' }));
  assert.match(await historial('tienda', 'respaldo-semanal'), /actualiza respaldo-semanal/);
  assert.match(await deshacer('tienda'), /Deshecho/);
  assert.match(await leer('tienda', ['respaldo-semanal']), /pg_dump cada lunes/);
  await assert.rejects(() => deshacer('tienda', 'no-es-un-codigo'), /No se pudo deshacer/);
});

test('hay un respaldo al día, fuera de la carpeta del cerebro', () => {
  const dias = readdirSync(join(raizRespaldos(), 'tienda'));
  assert.equal(dias.length, 1);
  assert.ok(existsSync(join(raizRespaldos(), 'tienda', dias[0], 'notas', 'respaldo-semanal.md')));
  assert.ok(existsSync(join(raizRespaldos(), 'tienda', dias[0], 'cerebro.json')));
});

test('dos escrituras a la vez no se pisan y un bloqueo abandonado no detiene', async () => {
  const orden: string[] = [];
  await Promise.all([
    conBloqueo('tienda', async () => {
      orden.push('a-entra');
      await new Promise((r) => setTimeout(r, 150));
      orden.push('a-sale');
    }),
    (async () => {
      await new Promise((r) => setTimeout(r, 20));
      // otra sesión: otro proceso, sin el bloqueo en memoria de este
      const { spawn } = await import('node:child_process');
      const hijo = spawn(process.execPath, ['cli/cerebro.ts', 'estado', 'tienda', 'consolidada', 'motor-de-precios'], { env: process.env });
      let error = '';
      hijo.stderr.on('data', (d) => (error += d));
      const codigo = await new Promise((r) => hijo.on('close', r));
      orden.push(codigo === 0 ? 'b-escribe' : `b-falla: ${error}`);
    })(),
  ]);
  assert.deepEqual(orden, ['a-entra', 'a-sale', 'b-escribe']);
  // un bloqueo viejo (proceso que murió) se da por abandonado
  const { utimesSync } = await import('node:fs');
  const ruta = join(rutaCerebro('tienda'), '.bloqueo');
  writeFileSync(ruta, 'muerto');
  utimesSync(ruta, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  assert.equal(await conBloqueo('tienda', async () => 'paso'), 'paso');
});

test('la actividad se resume al crecer y las lecturas no se pierden', async () => {
  const ruta = join(rutaCerebro('tienda'), '.actividad.jsonl');
  const antes = (await leerUso('tienda')).get('respaldo-semanal')?.lecturas ?? 0;
  const linea = `${JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', accion: 'leer', notas: ['respaldo-semanal'], pid: 1 })}\n`;
  writeFileSync(ruta, readFileSync(ruta, 'utf8') + linea.repeat(6000));
  assert.equal(await rotarActividad('tienda'), true);
  assert.ok(readFileSync(ruta, 'utf8').split('\n').length <= 1502);
  assert.equal((await leerUso('tienda')).get('respaldo-semanal')?.lecturas, antes + 6000);
  assert.equal(await rotarActividad('tienda'), false);
});

test('busca en todos los cerebros y enlaza de uno a otro', async () => {
  await crearCerebro('personal', 'Cómo trabaja el usuario', true);
  await escribir('personal', nota('Commits en español', 'convencion', 'Los commits van en español y sin firma', 'Los mensajes de commit van en español, cortos y sin firma automática.'));
  const todos = await buscar('tienda', 'commits español', { todos: true });
  assert.match(todos, /\[personal:commits-en-espanol\]/);
  const r = await escribir('tienda', nota('Cómo se hacen los commits aquí', 'convencion', 'Sigue la regla personal de commits', 'Igual que en [[personal:commits-en-espanol]] y además [[personal:no-existe]].'));
  assert.match(r, /\[\[personal:no-existe\]\] apunta a una nota que no existe en personal/);
  assert.doesNotMatch(r, /Enlaces que no existen/);
  assert.match(await leer('tienda', ['personal:commits-en-espanol']), /# Commits en español/);
  assert.match(await verificar('tienda'), /\[\[personal:no-existe\]\] no existe en personal/);
});

test('importa una bóveda de Obsidian: primero muestra, luego escribe', async () => {
  const boveda = mkdtempSync(join(tmpdir(), 'cerebro-boveda-'));
  mkdirSync(join(boveda, '08 Decisiones'));
  mkdirSync(join(boveda, 'Personas'));
  writeFileSync(
    join(boveda, '08 Decisiones', 'ADR-001 Usar Postgres.md'),
    '---\ntipo: adr\naliases: [ADR-001]\nfuente: [docs/adr/001.md]\ntags: [proyecto, datos]\n---\n# ADR-001 Usar Postgres\n\n> Se usa Postgres porque ya lo conoce el equipo.\n\n> [!warning] Ojo\n> No hay réplica.\n\nLa pidió [[Ana Ruiz]]. Ver también [[ADR-001]].\n',
  );
  writeFileSync(join(boveda, 'Personas', 'Ana Ruiz.md'), '# Ana Ruiz\n\nAna es la responsable de datos del proyecto y decide sobre el esquema.\n');
  await crearCerebro('importado', 'Cerebro traído de Obsidian');
  const previa = await importarObsidian('importado', boveda);
  assert.match(previa, /2 notas/);
  assert.match(previa, /vista previa/);
  assert.equal((await abrir('importado')).grafo.notas.size, 0);
  await importarObsidian('importado', boveda, { aplicar: true });
  const { grafo } = await abrir('importado');
  const adr = grafo.notas.get('adr-001-usar-postgres')!;
  assert.equal(adr.tipo, 'decision');
  assert.equal(adr.descripcion, 'Se usa Postgres porque ya lo conoce el equipo');
  assert.deepEqual(adr.alias, ['ADR-001']);
  assert.deepEqual(adr.fuente, ['docs/adr/001.md']);
  assert.match(adr.contenido, /> \*\*Ojo\*\*/);
  assert.equal(grafo.notas.get('ana-ruiz')!.tipo, 'persona');
  assert.equal(grafo.rotos.size, 0);
  assert.equal(adr.origen, 'importacion');
});

test('siembra desde la documentación de un repositorio', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'cerebro-docs-'));
  mkdirSync(join(repo, 'docs', 'adr'), { recursive: true });
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'README.md'), '# Tienda\n\nTienda en línea para vender repuestos, con panel de administración.\n\n## Instalar\n\nCorre npm install.\n');
  writeFileSync(join(repo, 'docs', 'adr', '001-pagos.md'), '# ADR-001 Pagos con pasarela externa\n\nSe usa una pasarela externa para no guardar tarjetas.\n');
  writeFileSync(join(repo, 'CHANGELOG.md'), '# Changelog\n\nUn historial largo que no debe entrar al cerebro porque ya lo dice git.\n');
  writeFileSync(join(repo, 'src', 'notas.md'), '# Notas sueltas\n\nUn archivo Markdown dentro del código que no es documentación del proyecto.\n');
  await crearCerebro('sembrado', 'Cerebro sembrado desde docs');
  const previa = await sembrar('sembrado', repo);
  assert.match(previa, /2 notas/);
  assert.match(previa, /decision\s+\[adr-001-pagos-con-pasarela-externa\] ← docs\/adr\/001-pagos\.md/);
  assert.doesNotMatch(previa, /changelog|notas-sueltas/i);
  await sembrar('sembrado', repo, { aplicar: true });
  const { grafo } = await abrir('sembrado');
  assert.deepEqual(grafo.notas.get('adr-001-pagos-con-pasarela-externa')!.fuente, ['docs/adr/001-pagos.md']);
  assert.equal(grafo.notas.get('tienda')!.tipo, 'contexto');
});

test('trae la memoria propia de Claude Code como notas sin revisar', async () => {
  const memoria = mkdtempSync(join(tmpdir(), 'cerebro-memoria-cc-'));
  writeFileSync(join(memoria, 'MEMORY.md'), '- [Commits](commits-cortos.md) — cómo los quiere\n');
  writeFileSync(
    join(memoria, 'commits-cortos.md'),
    '---\nname: commits-cortos\ndescription: El usuario quiere commits cortos y en español\nmetadata:\n  type: feedback\n---\n\nCommits de una línea, en español. **Why:** los lee en el móvil.\n',
  );
  await crearCerebro('con-memoria', 'Cerebro que recibe la memoria de Claude Code');
  assert.match(await importarMemoria('con-memoria', memoria), /Vista previa/);
  await importarMemoria('con-memoria', memoria, { aplicar: true });
  const n = (await abrir('con-memoria')).grafo.notas.get('commits-cortos')!;
  assert.equal(n.tipo, 'convencion');
  assert.equal(n.estado, 'reciente');
  assert.equal(n.descripcion, 'El usuario quiere commits cortos y en español');
});
