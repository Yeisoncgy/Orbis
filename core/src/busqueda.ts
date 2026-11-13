// Búsqueda por relevancia (BM25 por campos) con apoyo del grafo. Todo local y sin dependencias.
import { normalizar } from './nota.ts';
import { distancia, palabras, raizDe, terminos } from './texto.ts';
import type { Grafo, Nota, Tipo, Uso } from './tipos.ts';

/** Lo que pesa cada campo: una palabra en el título dice más que la misma palabra en el cuerpo */
const PESO = { titulo: 5, alias: 4, descripcion: 2.5, tags: 2, cuerpo: 1 };
const K1 = 1.4;
const B = 0.7;

export interface Bolsa {
  /** término → frecuencia ponderada por campo */
  tf: Record<string, number>;
  /** largo del documento en términos del cuerpo */
  largo: number;
}

const bolsas = new WeakMap<Nota, Bolsa>();

export function bolsaDe(nota: Nota): Bolsa {
  const previa = bolsas.get(nota);
  if (previa) return previa;
  const tf: Record<string, number> = {};
  const sumar = (texto: string, peso: number): number => {
    const ts = terminos(texto);
    for (const t of ts) tf[t] = (tf[t] ?? 0) + peso;
    return ts.length;
  };
  sumar(`${nota.titulo} ${nota.id.replace(/-/g, ' ')}`, PESO.titulo);
  sumar((nota.alias ?? []).join(' '), PESO.alias);
  sumar(nota.descripcion, PESO.descripcion);
  sumar(nota.tags.join(' '), PESO.tags);
  const largo = sumar(nota.contenido, PESO.cuerpo);
  const bolsa = { tf, largo };
  bolsas.set(nota, bolsa);
  return bolsa;
}

/** El índice en caché trae las bolsas ya calculadas */
export function recordarBolsa(nota: Nota, bolsa: Bolsa): void {
  bolsas.set(nota, bolsa);
}

export interface Filtros {
  tipo?: Tipo;
  tag?: string;
  estado?: string;
  /** actualizadas desde esta fecha (AAAA-MM-DD) */
  desde?: string;
  /** sin probar palabras parecidas cuando una no existe en el cerebro */
  estricta?: boolean;
  /** false = sin el diccionario de sinónimos (para medir cuánto aporta) */
  sinonimos?: boolean;
}

export interface Resultado {
  id: string;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  puntaje: number;
  fragmento: string;
}

interface Estadisticas {
  n: number;
  largoMedio: number;
  df: Map<string, number>;
}

function estadisticas(notas: Nota[]): Estadisticas {
  const df = new Map<string, number>();
  let total = 0;
  for (const nota of notas) {
    const { tf, largo } = bolsaDe(nota);
    total += largo;
    for (const t of Object.keys(tf)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return { n: notas.length, largoMedio: notas.length ? total / notas.length : 1, df };
}

function idf(est: Estadisticas, termino: string): number {
  const df = est.df.get(termino) ?? 0;
  return Math.log(1 + (est.n - df + 0.5) / (df + 0.5));
}

// Sinónimos de uso común en proyectos de software y de negocio en español. Cada grupo se busca como una sola idea.
// Lo propio de cada proyecto no va aquí: va en el campo `alias` de la nota.
const GRUPOS = [
  'respaldo backup copia-de-seguridad',
  'despliegue deploy publicar publicacion desplegar',
  'revertir rollback volver-atras deshacer',
  'descuento rebaja',
  'error fallo bug falla',
  'borrar eliminar quitar',
  'crear agregar anadir',
  'usuario cuenta',
  'contrasena clave password',
  'correo email mail',
  'prueba test testing',
  'rendimiento performance velocidad carga',
  'navegador browser',
  'servidor server backend',
  'base-de-datos bd database',
  'tarea-programada cron',
  'limite tope maximo',
  'precio costo valor tarifa',
  'factura cobro cuenta-de-cobro',
  'dueno gerente propietario director',
  'empresa compania organizacion',
  'cliente comprador',
  'proveedor aliado taller',
  'archivo fichero',
  'carpeta directorio',
  'iva impuesto-al-valor-agregado',
  'seo posicionamiento buscadores',
  'ia inteligencia-artificial llm',
  'licencia licenciamiento',
  'seguridad proteccion',
  'documentacion docs manual guia',
  'configuracion ajustes settings',
  'instalar instalacion montar levantar',
  'arreglo fix correccion corregir',
  'reunion llamada',
  'plazo entrega fecha-limite',
  'pendiente tarea por-hacer',
];

const SINONIMOS = new Map<string, string[]>();
for (const grupo of GRUPOS) {
  const formas = grupo.split(' ').map((f) => f.replace(/-/g, ' '));
  const claves = formas.map((f) => terminos(f).join(' '));
  claves.forEach((clave, i) => {
    if (!clave) return;
    SINONIMOS.set(clave, [...(SINONIMOS.get(clave) ?? []), ...formas.filter((_, j) => j !== i)]);
  });
}

interface Consulta {
  /** término → peso (1 los que escribió quien busca, menos los que se le suman) */
  pesos: Map<string, number>;
  /** términos escritos por quien busca: cuentan para «cuántas palabras de la consulta aparecen» */
  propios: string[];
  frases: string[];
}

function prepararConsulta(texto: string, est: Estadisticas, estricta: boolean, conSinonimos: boolean): Consulta {
  const frases = [...texto.matchAll(/"([^"]+)"/g)].map((m) => normalizar(m[1]).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const propios = [...new Set(terminos(texto.replace(/"/g, ' ')))];
  const pesos = new Map<string, number>(propios.map((t) => [t, 1]));
  const sumar = (t: string, peso: number) => {
    if (!pesos.has(t) || (pesos.get(t) ?? 0) < peso) pesos.set(t, peso);
  };

  // sinónimos: de una palabra y de dos seguidas («copia de seguridad»)
  const crudas = terminos(texto.replace(/"/g, ' '));
  const candidatas = [...crudas, ...crudas.slice(0, -1).map((t, i) => `${t} ${crudas[i + 1]}`)];
  for (const c of conSinonimos ? candidatas : []) {
    for (const forma of SINONIMOS.get(c) ?? []) for (const t of terminos(forma)) if (!propios.includes(t)) sumar(t, 0.6);
  }
  if (estricta) return { pesos, propios, frases };

  // una palabra que no existe en el cerebro: se prueba con las que más se le parecen (erratas, otra conjugación)
  const vocabulario = [...est.df.keys()];
  for (const t of propios) {
    if (est.df.has(t) || t.length < 5) continue;
    const parecidas = vocabulario
      .filter((v) => v.length >= 4 && (v.startsWith(t.slice(0, 5)) || distancia(v, t, 2) <= (t.length > 7 ? 2 : 1)))
      .slice(0, 4);
    for (const v of parecidas) sumar(v, 0.5);
  }

  return { pesos, propios, frases };
}

function fragmento(contenido: string, raices: string[]): string {
  const plano = contenido.replace(/\s+/g, ' ');
  const norm = normalizar(plano);
  let pos = Infinity;
  for (const r of raices) {
    const p = norm.search(new RegExp(`\\b${r.replace(/[^a-z0-9_]/g, '')}`));
    if (p >= 0 && p < pos) pos = p;
  }
  if (!Number.isFinite(pos)) return plano.slice(0, 160);
  const inicio = Math.max(0, pos - 60);
  return `${inicio > 0 ? '…' : ''}${plano.slice(inicio, inicio + 180)}…`;
}

function pasaFiltros(nota: Nota, f: Filtros): boolean {
  if (f.estado ? nota.estado !== f.estado : nota.estado === 'obsoleta') return false;
  if (f.tipo && nota.tipo !== f.tipo) return false;
  if (f.tag && !nota.tags.some((t) => normalizar(t) === normalizar(f.tag ?? ''))) return false;
  if (f.desde && nota.actualizado < f.desde) return false;
  return true;
}

/**
 * Notas ordenadas por relevancia. Tres señales: (1) BM25 por campos sobre raíces de palabra, (2) cuántas de las
 * palabras escritas aparecen, (3) el grafo: una nota muy enlazada, muy leída o vecina de otro buen resultado sube.
 */
export function buscarEnGrafo(grafo: Grafo, texto: string, filtros: Filtros = {}, limite = 8, uso?: Map<string, Uso>): Resultado[] {
  const vivas = [...grafo.notas.values()].filter((n) => n.estado !== 'obsoleta' || filtros.estado === 'obsoleta');
  const est = estadisticas(vivas);
  const consulta = prepararConsulta(texto, est, filtros.estricta === true, filtros.sinonimos !== false);
  if (consulta.pesos.size === 0 && consulta.frases.length === 0) return [];

  const base = new Map<string, number>();
  for (const nota of vivas) {
    if (!pasaFiltros(nota, filtros)) continue;
    if (consulta.frases.length) {
      const todo = normalizar(`${nota.titulo} ${nota.descripcion} ${(nota.alias ?? []).join(' ')} ${nota.contenido}`).replace(/\s+/g, ' ');
      if (!consulta.frases.every((f) => todo.includes(f))) continue;
    }
    const { tf, largo } = bolsaDe(nota);
    let puntaje = consulta.frases.length ? 1 : 0;
    for (const [t, peso] of consulta.pesos) {
      const f = tf[t];
      if (!f) continue;
      puntaje += peso * idf(est, t) * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * largo) / est.largoMedio)));
    }
    if (puntaje <= 0) continue;
    const presentes = consulta.propios.filter((t) => t in tf).length;
    const cobertura = consulta.propios.length ? presentes / consulta.propios.length : 1;
    base.set(nota.id, puntaje * (0.4 + 0.6 * cobertura));
  }

  const final = new Map<string, number>();
  for (const [id, puntaje] of base) {
    const entrantes = grafo.entrantes.get(id)?.length ?? 0;
    const lecturas = uso?.get(id)?.lecturas ?? 0;
    final.set(id, puntaje * (1 + 0.04 * Math.log2(1 + entrantes)) * (1 + 0.05 * Math.log2(1 + lecturas)));
  }
  // una nota enlazada con otros buenos resultados trata, casi seguro, de lo mismo
  const vecinos = new Map<string, Set<string>>();
  for (const a of grafo.aristas) {
    if (a.clase !== 'enlace' || !base.has(a.origen) || !base.has(a.destino)) continue;
    (vecinos.get(a.origen) ?? vecinos.set(a.origen, new Set()).get(a.origen))?.add(a.destino);
    (vecinos.get(a.destino) ?? vecinos.set(a.destino, new Set()).get(a.destino))?.add(a.origen);
  }
  const maximo = Math.max(...base.values(), 0);
  for (const [id, vs] of vecinos) {
    const apoyo = [...vs].map((v) => base.get(v) ?? 0).sort((a, b) => b - a).slice(0, 3).reduce((s, v) => s + v, 0);
    final.set(id, (final.get(id) ?? 0) + 0.06 * Math.min(apoyo, maximo));
  }

  const raices = [...consulta.pesos.keys()];
  return [...final]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([id, puntaje]) => {
      const nota = grafo.notas.get(id) as Nota;
      return { id, titulo: nota.titulo, tipo: nota.tipo, descripcion: nota.descripcion, puntaje, fragmento: fragmento(nota.contenido, raices) };
    });
}

/** Cuando no sale nada: palabras del cerebro parecidas a las que se escribieron */
export function sugerencias(grafo: Grafo, texto: string): string[] {
  const vocabulario = new Map<string, number>();
  for (const nota of grafo.notas.values()) {
    if (nota.estado === 'obsoleta') continue;
    for (const p of palabras(`${nota.titulo} ${nota.descripcion} ${nota.tags.join(' ')} ${(nota.alias ?? []).join(' ')}`)) {
      if (p.length > 3) vocabulario.set(p, (vocabulario.get(p) ?? 0) + 1);
    }
  }
  const salida = new Set<string>();
  for (const p of palabras(texto)) {
    if (p.length < 4) continue;
    const r = raizDe(p);
    [...vocabulario.keys()]
      .filter((v) => v !== p && (raizDe(v).startsWith(r.slice(0, 4)) || distancia(v, p, 2) <= 2))
      .sort((a, b) => (vocabulario.get(b) ?? 0) - (vocabulario.get(a) ?? 0))
      .slice(0, 3)
      .forEach((v) => salida.add(v));
  }
  return [...salida].slice(0, 8);
}

/** Parecido entre dos notas por sus títulos (0 a 1): para detectar duplicados al escribir */
export function parecidoDeTitulo(a: string, b: string): number {
  const ta = new Set(terminos(a));
  const tb = new Set(terminos(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let comunes = 0;
  for (const t of ta) if (tb.has(t)) comunes++;
  const parecido = comunes / (ta.size + tb.size - comunes);
  // «Versión 0.12.1» y «Versión 0.12.2», o «ADR-005» y «ADR-006», no son la misma nota: los números mandan
  const numeros = (x: string) => (x.match(/\d+/g) ?? []).join('.');
  return numeros(a) && numeros(b) && numeros(a) !== numeros(b) ? Math.min(parecido, 0.4) : parecido;
}
