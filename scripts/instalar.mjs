// Conecta Cerebro a Claude Code. Idempotente. No lanza procesos: solo copia archivos y edita JSON/Markdown.
//   npm run instalar                              CLI en ~/.claude/cerebro, skill e instrucciones globales
//   npm run instalar -- --raiz "D:\Cerebros"      dónde viven los cerebros (por defecto, donde ya estén)
//   npm run instalar -- --respaldo "E:\Respaldo"  dónde va la copia diaria (lo ideal: otro disco)
//   npm run instalar -- --apagar-memoria          además apaga la memoria propia de Claude Code
// Para quitarlo todo: npm run desinstalar
// Sin hooks ni MCP: la política corporativa (allowManagedHooksOnly) los ignora.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error(`Cerebro necesita Node.js 24 o superior y este equipo tiene la ${process.versions.node}.`);
  process.exit(1);
}

const RAIZ_PROYECTO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE = join(homedir(), '.claude');
// Ruta sin espacios y fuera del repo: los agentes la escriben en cada comando
const DESTINO = join(CLAUDE, 'cerebro');
const CLI = join(DESTINO, 'cerebro.mjs');
const CONFIG = join(DESTINO, 'config.json');
const SETTINGS = join(CLAUDE, 'settings.json');
const CLAUDE_MD = join(CLAUDE, 'CLAUDE.md');
const INICIO = '<!-- cerebro:inicio -->';
const FIN = '<!-- cerebro:fin -->';
const FIRMAS_HOOKS_VIEJOS = ['recordar.mjs', 'contexto-sesion'];

const barras = (ruta) => ruta.replace(/\\/g, '/');
const comando = `node "${barras(CLI)}"`;

function opcion(nombre) {
  const i = process.argv.indexOf(nombre);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? resolve(process.argv[i + 1]) : undefined;
}

function leerJson(ruta) {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return {};
  }
}

function paso(texto) {
  console.log(`- ${texto}`);
}

const cli = join(RAIZ_PROYECTO, 'dist', 'cerebro.mjs');
if (!existsSync(cli)) {
  console.error('Falta dist/cerebro.mjs. Corre primero: npm run build');
  process.exit(1);
}

mkdirSync(DESTINO, { recursive: true });
copyFileSync(cli, CLI);
paso(`CLI copiado a ${CLI}`);

// Dónde viven los cerebros y sus respaldos queda escrito: no depende de adivinar la carpeta Documentos, que en
// equipos de empresa suele estar redirigida a OneDrive. Lo ya configurado se respeta.
const config = leerJson(CONFIG);
const raizPorDefecto = join(homedir(), 'Documents', 'Cerebros');
config.raiz = opcion('--raiz') ?? process.env.CEREBRO_RAIZ ?? config.raiz ?? raizPorDefecto;
config.respaldo = opcion('--respaldo') ?? process.env.CEREBRO_RESPALDO ?? config.respaldo ?? join(dirname(config.raiz), 'Cerebros-respaldo');
const RAIZ_CEREBROS = config.raiz;
mkdirSync(RAIZ_CEREBROS, { recursive: true });
paso(`Cerebros en ${RAIZ_CEREBROS}`);
paso(`Respaldo diario en ${config.respaldo}`);
if (/onedrive/i.test(RAIZ_CEREBROS)) {
  paso('  Ojo: esa carpeta está en OneDrive. Las notas se sincronizarían a la nube de la empresa y el historial de git sufre.');
  paso('  Para dejarlos solo en este equipo: npm run instalar -- --raiz "C:\\Cerebros"');
}
if (dirname(config.respaldo) === dirname(RAIZ_CEREBROS)) {
  paso('  El respaldo queda en el mismo disco: protege de borrar una nota, no de que falle el disco.');
  paso('  Para otro disco o una memoria USB: npm run instalar -- --respaldo "E:\\Respaldo-cerebros"');
}

const dirSkill = join(CLAUDE, 'skills', 'cerebro');
mkdirSync(dirSkill, { recursive: true });
const skill = readFileSync(join(RAIZ_PROYECTO, 'skill', 'cerebro', 'SKILL.md'), 'utf8').replaceAll('{{CEREBRO}}', barras(CLI));
writeFileSync(join(dirSkill, 'SKILL.md'), skill, 'utf8');
paso('Skill /cerebro instalada');

let memoriaApagada = config.memoriaApagada === true;
if (existsSync(SETTINGS)) {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  if (!existsSync(`${SETTINGS}.antes-de-cerebro`)) copyFileSync(SETTINGS, `${SETTINGS}.antes-de-cerebro`);
  let quitados = 0;
  for (const evento of Object.keys(settings.hooks ?? {})) {
    settings.hooks[evento] = settings.hooks[evento]
      .map((g) => {
        const hooks = (g.hooks ?? []).filter((h) => !FIRMAS_HOOKS_VIEJOS.some((f) => h.command?.includes(f)));
        quitados += (g.hooks ?? []).length - hooks.length;
        return { ...g, hooks };
      })
      .filter((g) => g.hooks.length > 0);
    if (settings.hooks[evento].length === 0) delete settings.hooks[evento];
  }
  if (process.argv.includes('--apagar-memoria') && settings.autoMemoryEnabled !== false) {
    // se anota cómo estaba para que desinstalar lo deje igual
    config.memoriaAntes = settings.autoMemoryEnabled ?? null;
    config.memoriaApagada = true;
    memoriaApagada = true;
    settings.autoMemoryEnabled = false;
    paso('Memoria propia de Claude Code apagada (autoMemoryEnabled: false)');
  }
  writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  if (quitados) paso(`Quitados ${quitados} hooks de versiones anteriores (la política los ignora)`);
}
writeFileSync(CONFIG, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

// El mapa del cerebro personal se importa en todas las sesiones (cómo trabaja el usuario)
const personal = existsSync(RAIZ_CEREBROS)
  ? readdirSync(RAIZ_CEREBROS).find((n) => leerJson(join(RAIZ_CEREBROS, n, 'cerebro.json')).personal === true)
  : undefined;
const importPersonal = personal
  ? `\nMapa del cerebro personal \`${personal}\` (cómo trabaja el usuario):\n\n@${barras(join(RAIZ_CEREBROS, personal, 'MAPA.md'))}\n`
  : '';

// Este bloque se carga en todas las sesiones: cada línea se paga siempre. El detalle vive en la skill.
const BLOQUE_GLOBAL = `${INICIO}
## Cerebro (memoria entre sesiones)

- Lo aprendido en una sesión vive en un cerebro: \`${comando} <comando> <cerebro>\` desde Bash. El detalle está en la skill \`/cerebro\`.
- **Al empezar una tarea:** si el \`CLAUDE.md\` del proyecto dice \`Cerebro: <nombre>\`, corre \`buscar <nombre> <palabras de la tarea>\` y \`leer\` lo que salga, antes de explorar el repositorio.
- **Antes de terminar** una sesión en la que se decidió o se descubrió algo: \`cerrar <nombre>\`.
- ${
  memoriaApagada
    ? 'La memoria propia de Claude Code está apagada: todo lo que deba recordarse va al cerebro.'
    : 'El cerebro es la memoria que el usuario ve y revisa. En `~/.claude/projects/*/memory/` deja solo un apuntador al cerebro del proyecto; el conocimiento va al cerebro.'
}
${importPersonal}${FIN}`;

const actual = existsSync(CLAUDE_MD) ? readFileSync(CLAUDE_MD, 'utf8') : '';
if (actual && !existsSync(`${CLAUDE_MD}.antes-de-cerebro`)) copyFileSync(CLAUDE_MD, `${CLAUDE_MD}.antes-de-cerebro`);
const patron = new RegExp(`${INICIO}[\\s\\S]*?${FIN}`);
const nuevo = patron.test(actual) ? actual.replace(patron, () => BLOQUE_GLOBAL) : `${actual.trimEnd()}${actual ? '\n\n' : ''}${BLOQUE_GLOBAL}\n`;
writeFileSync(CLAUDE_MD, nuevo, 'utf8');
paso('Instrucciones globales en ~/.claude/CLAUDE.md');
if (personal) paso(`Mapa del cerebro personal "${personal}" importado en todas las sesiones`);
if (personal && !existsSync(join(RAIZ_CEREBROS, personal, 'MAPA.md'))) paso(`Falta su MAPA.md: corre ${comando} regenerar ${personal}`);

console.log('\nListo. Las sesiones nuevas de Claude Code ya lo usan. Comprueba con:');
console.log(`  ${comando} listar`);
