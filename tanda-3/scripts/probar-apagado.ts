// Prueba el apagado solo del servidor (el del acceso directo) sin abrir el navegador: arranca, sigue vivo
// mientras hay una pestana (una conexion a /api/eventos) y se apaga solo al quedar sin pestanas.
//   npm run probar:apagado   (Orbis tiene que estar cerrado: usa el puerto 4810)
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raizRepo = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_APP = 'http://127.0.0.1:4810';
const ESPERA_MS = 20000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

function libre(puerto: number): Promise<boolean> {
  return new Promise((resolver) => {
    const s = createServer();
    s.once('error', () => resolver(false));
    s.once('listening', () => s.close(() => resolver(true)));
    s.listen(puerto, '127.0.0.1');
  });
}

async function responde(): Promise<boolean> {
  try {
    return (await fetch(`${URL_APP}/api/salud`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

if (!(await libre(4810))) {
  console.log('FALLO: el puerto 4810 esta ocupado; cierra Orbis antes de probar');
  process.exit(1);
}

const hijo = spawn(process.execPath, ['servidor/servidor.ts'], {
  cwd: raizRepo,
  env: { ...process.env, CEREBRO_APAGAR_SIN_PESTANAS_MS: String(ESPERA_MS) },
  stdio: 'ignore',
  windowsHide: true,
});
let salida: number | null | undefined;
hijo.on('exit', (codigo) => (salida = codigo));

const t0 = Date.now();
while (!(await responde()) && Date.now() - t0 < 30000 && salida === undefined) await dormir(500);
if (!(await responde())) {
  console.log(`FALLO: no arranco (salida ${salida})`);
  process.exit(1);
}
console.log(`arranco en ${((Date.now() - t0) / 1000).toFixed(0)} s`);

const pestana = new AbortController();
const flujo = await fetch(`${URL_APP}/api/eventos`, { signal: pestana.signal });
const lector = flujo.body!.getReader();
void (async () => {
  try {
    while (!(await lector.read()).done) {}
  } catch {}
})();
await dormir(ESPERA_MS + 10000);
console.log(
  salida === undefined && (await responde())
    ? `con pestana abierta sigue vivo tras ${(ESPERA_MS + 10000) / 1000} s`
    : 'FALLO: se apago con una pestana abierta',
);

pestana.abort();
const corte = Date.now();
while (salida === undefined && Date.now() - corte < ESPERA_MS + 40000) await dormir(500);
console.log(
  salida === undefined
    ? 'FALLO: no se apago sin pestanas'
    : `sin pestanas se apago en ${((Date.now() - corte) / 1000).toFixed(0)} s (codigo ${salida})`,
);
await dormir(1000);
console.log(`puerto 4810 libre: ${await libre(4810)}`);
if (salida === undefined) hijo.kill();
