// Conecta Cerebro a Claude Code. Idempotente. No lanza procesos: solo copia archivos y edita JSON/Markdown.
//   npm run instalar                     CLI en ~/.claude/cerebro, skill e instrucciones globales
//   npm run instalar -- --apagar-memoria además apaga la memoria propia de Claude Code
// Sin hooks: la política corporativa (allowManagedHooksOnly) ignora los hooks de usuario.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ_PROYECTO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE = join(homedir(), '.claude');
// Ruta sin espacios y fuera del repo: los agentes la escriben en cada comando
const DESTINO = join(CLAUDE, 'cerebro');
const CLI = join(DESTINO, 'cerebro.mjs');
const SETTINGS = join(CLAUDE, 'settings.json');
const CLAUDE_MD = join(CLAUDE, 'CLAUDE.md');
const INICIO = '<!-- cerebro:inicio -->';
const FIN = '<!-- cerebro:fin -->';
const FIRMAS_HOOKS_VIEJOS = ['recordar.mjs', 'contexto-sesion'];

const barras = (ruta) => ruta.replace(/\\/g, '/');
const comando = `node "${barras(CLI)}"`;

// El mapa del cerebro personal se importa en todas las sesiones (preferencias del usuario, ~2.5K tokens)
const RAIZ_CEREBROS = process.env.CEREBRO_RAIZ ?? join(homedir(), 'Documents', 'Cerebros');
const personal = existsSync(RAIZ_CEREBROS)
  ? readdirSync(RAIZ_CEREBROS).find((n) => {
      const meta = join(RAIZ_CEREBROS, n, 'cerebro.json');
      try {
        return existsSync(meta) && JSON.parse(readFileSync(meta, 'utf8')).personal === true;
      } catch {
        return false;
      }
    })
  : undefined;
const importPersonal = personal
  ? `\nMapa del cerebro personal \`${personal}\` (cómo trabaja el usuario; abre las notas con \`${comando} leer ${personal} <id...>\`):\n\n@${barras(join(RAIZ_CEREBROS, personal, 'MAPA.md'))}\n`
  : '';

const BLOQUE_GLOBAL = `${INICIO}
## Cerebro (memoria de trabajo)

- La memoria vive en los cerebros (\`Documents\\Cerebros\\\`), no en la memoria propia de Claude Code. No escribas en \`~/.claude/projects/*/memory/\`.
- Si el \`CLAUDE.md\` del proyecto dice \`Cerebro: <nombre>\` e importa su \`MAPA.md\`, ya tienes el mapa de ese cerebro en contexto: úsalo antes de explorar el repositorio y abre solo las notas que necesites.
- Se consultan con la herramienta Bash: \`${comando} leer <cerebro> <id...>\`, \`buscar <cerebro> <palabras>\` o \`mapa <cerebro>\`.
- El cerebro personal (\`${comando} listar\` lo marca como \`(personal)\`) guarda cómo trabaja el usuario: consúltalo cuando dudes de una preferencia o convención.
- Cuando decidas algo, descubras algo no obvio o aprendas cómo trabaja el usuario, guárdalo con la skill \`/cerebro\` antes de terminar (una idea por nota, con el porqué y enlazada con \`[[id]]\`).
${importPersonal}${FIN}`;

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

const dirSkill = join(CLAUDE, 'skills', 'cerebro');
mkdirSync(dirSkill, { recursive: true });
const skill = readFileSync(join(RAIZ_PROYECTO, 'skill', 'cerebro', 'SKILL.md'), 'utf8').replaceAll('{{CEREBRO}}', barras(CLI));
writeFileSync(join(dirSkill, 'SKILL.md'), skill, 'utf8');
paso('Skill /cerebro instalada');

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
  if (process.argv.includes('--apagar-memoria')) {
    settings.autoMemoryEnabled = false;
    paso('Memoria propia de Claude Code apagada (autoMemoryEnabled: false)');
  }
  writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  if (quitados) paso(`Quitados ${quitados} hooks de versiones anteriores (la política los ignora)`);
}

const actual = existsSync(CLAUDE_MD) ? readFileSync(CLAUDE_MD, 'utf8') : '';
const patron = new RegExp(`${INICIO}[\\s\\S]*?${FIN}`);
const nuevo = patron.test(actual) ? actual.replace(patron, () => BLOQUE_GLOBAL) : `${actual.trimEnd()}${actual ? '\n\n' : ''}${BLOQUE_GLOBAL}\n`;
writeFileSync(CLAUDE_MD, nuevo, 'utf8');
paso('Instrucciones globales en ~/.claude/CLAUDE.md');
if (personal) paso(`Mapa del cerebro personal "${personal}" importado en todas las sesiones`);
if (personal && !existsSync(join(RAIZ_CEREBROS, personal, 'MAPA.md'))) paso(`Falta su MAPA.md: corre ${comando} regenerar ${personal}`);

console.log('\nListo. Las sesiones nuevas de Claude Code ya lo usan.');
