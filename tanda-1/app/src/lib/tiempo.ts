const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto', style: 'short' });
const fecha = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

export function haceCuanto(iso: string, ahora = Date.now()): string {
  const s = Math.round((new Date(iso).getTime() - ahora) / 1000);
  const a = Math.abs(s);
  if (a < 10 || s > 0) return 'ahora';
  if (a < 60) return relativo.format(s, 'second');
  if (a < 3600) return relativo.format(Math.round(s / 60), 'minute');
  if (a < 86400) return relativo.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return relativo.format(Math.round(s / 86400), 'day');
  return fecha.format(new Date(iso));
}

// Las fechas de las notas vienen como AAAA-MM-DD (sin hora): se interpretan en hora local
export function fechaCorta(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number);
  if (!a || !m || !d) return dia;
  return fecha.format(new Date(a, m - 1, d));
}

export function diasDesde(dia: string, ahora = Date.now()): number {
  const t = new Date(dia.length === 10 ? `${dia}T12:00:00` : dia).getTime();
  return Number.isFinite(t) ? Math.max(0, (ahora - t) / 86400000) : 0;
}
