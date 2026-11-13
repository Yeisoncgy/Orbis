// Dice si hay un Orbis respondiendo en el 4810. Espera hasta 60 s a que arranque.
//   npm run abierto
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  try {
    const r = await fetch('http://127.0.0.1:4810/api/salud', { signal: AbortSignal.timeout(1500) });
    if (r.ok && ((await r.json()) as { app?: string }).app === 'cerebro-app') {
      console.log(`Orbis abierto (respondio a los ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      process.exit(0);
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}
console.log('Orbis no responde tras 60 s');
process.exit(1);
