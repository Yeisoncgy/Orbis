// Quita Cerebro de Claude Code y deja la configuración como estaba. No toca los cerebros ni sus respaldos.
//   npm run desinstalar
// No lanza procesos: solo borra lo que instalar.mjs copió y deshace sus ediciones.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CLAUDE = join(homedir(), '.claude');
const DESTINO = join(CLAUDE, 'cerebro');
const CONFIG = join(DESTINO, 'config.json');
const SETTINGS = join(CLAUDE, 'settings.json');
const CLAUDE_MD = join(CLAUDE, 'CLAUDE.md');
const INICIO = '<!-- cerebro:inicio -->';
const FIN = '<!-- cerebro:fin -->';

function paso(texto) {
  console.log(`- ${texto}`);
}

let config = {};
try {
  config = JSON.parse(readFileSync(CONFIG, 'utf8'));
} catch {
  // sin configuración: se quita lo que haya
}

if (existsSync(CLAUDE_MD)) {
  const actual = readFileSync(CLAUDE_MD, 'utf8');
  const sinBloque = actual.replace(new RegExp(`\\n*${INICIO}[\\s\\S]*?${FIN}\\n?`), '\n');
  if (sinBloque !== actual) {
    writeFileSync(CLAUDE_MD, sinBloque.trimEnd() ? `${sinBloque.trimEnd()}\n` : '', 'utf8');
    paso('Quitado el bloque de Cerebro de ~/.claude/CLAUDE.md');
  }
}

if (config.memoriaApagada && existsSync(SETTINGS)) {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  if (config.memoriaAntes === null || config.memoriaAntes === undefined) delete settings.autoMemoryEnabled;
  else settings.autoMemoryEnabled = config.memoriaAntes;
  writeFileSync(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  paso('Memoria propia de Claude Code devuelta a como estaba');
}

const dirSkill = join(CLAUDE, 'skills', 'cerebro');
if (existsSync(dirSkill)) {
  rmSync(dirSkill, { recursive: true, force: true });
  paso('Skill /cerebro quitada');
}
if (existsSync(DESTINO)) {
  rmSync(DESTINO, { recursive: true, force: true });
  paso(`CLI y ajustes quitados (${DESTINO})`);
}

console.log('\nListo. Lo que NO se tocó:');
console.log(`- tus cerebros${config.raiz ? ` (${config.raiz})` : ''} y sus respaldos${config.respaldo ? ` (${config.respaldo})` : ''};`);
console.log('- las copias settings.json.antes-de-cerebro y CLAUDE.md.antes-de-cerebro, por si quieres comparar;');
console.log('- la línea `Cerebro: <nombre>` y el `@…MAPA.md` que haya en el CLAUDE.md de cada proyecto: quítalas a mano.');
