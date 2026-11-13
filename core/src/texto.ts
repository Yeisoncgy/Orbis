// Del texto a los términos que se indexan y se buscan: sin tildes, sin palabras vacías y reducidos a su raíz,
// para que «cotizar», «cotizado» y «cotizaciones» sean el mismo término.
import { normalizar } from './nota.ts';

const VACIAS = new Set(
  (
    'a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque cada como con contra cual cuales ' +
    'cuando cuanta cuantas cuanto cuantos de del desde donde dos el ella ellas ellos en entre era eran es esa esas ese eso ' +
    'esos esta estaba estan estas este esto estos fue ha hace hacer hacia han hasta hay la las le les lo los mas me mi ' +
    'mientras muy ni no nos o otra otras otro otros para pero por porque pues que quien quienes se sea segun ser si sin ' +
    'sobre solo son su sus tambien tan tanto te tiene tienen todo todos tras tu un una unas uno unos ya y e u ' +
    'the of and to in is for on with that this it as be are or an by at from'
  ).split(' '),
);

// Sufijos del más largo al más corto. Se quita el primero que deje una raíz suficiente.
const SUFIJOS = [
  'amientos', 'imientos', 'amiento', 'imiento', 'aciones', 'adores', 'adoras', 'idades',
  'acion', 'mente', 'ables', 'ibles', 'istas', 'iendo', 'ador', 'adora', 'idad', 'able', 'ible', 'ista', 'ando',
  'ados', 'adas', 'idos', 'idas', 'ado', 'ada', 'ido', 'ida', 'ar', 'er', 'ir', 'os', 'as', 'es', 'o', 'a', 'e',
];

export function raizDe(palabra: string): string {
  if (palabra.length <= 3 || /\d/.test(palabra)) return palabra;
  let p = palabra;
  // plural: «cotizaciones» → «cotizacion», «clientes» → «client», «precios» → «precio»
  if (p.length > 4 && /[^aeiou]es$/.test(p)) p = p.slice(0, -2);
  else if (p.length > 3 && p.endsWith('s') && !p.endsWith('ss')) p = p.slice(0, -1);
  for (const s of SUFIJOS) {
    if (!p.endsWith(s)) continue;
    const base = p.slice(0, -s.length);
    if (base.length >= (s.length === 1 ? 3 : 4)) return base;
  }
  return p;
}

/** Palabras tal cual (sin raíz ni filtro): sirve para frases exactas y sugerencias */
export function palabras(texto: string): string[] {
  return normalizar(texto.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

/**
 * Términos de un texto. Un identificador de código se conserva entero y además por partes:
 * `quote_requests` da quote_requests, quote y request; `computeQuotes` da computequotes, compute y quote.
 */
export function terminos(texto: string): string[] {
  const salida: string[] = [];
  for (const crudo of texto.split(/[^\p{L}\p{N}_]+/u)) {
    if (!crudo) continue;
    const entero = normalizar(crudo);
    const partes = normalizar(crudo.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')).split(/\s+/).filter(Boolean);
    if (partes.length > 1) salida.push(entero);
    for (const parte of partes) {
      if (parte.length < 2 && !/\d/.test(parte)) continue;
      if (VACIAS.has(parte)) continue;
      salida.push(raizDe(parte));
    }
  }
  return salida;
}

/** Distancia de edición con tope: deja de contar cuando ya pasó el máximo */
export function distancia(a: string, b: string, maximo = 2): number {
  if (Math.abs(a.length - b.length) > maximo) return maximo + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let minimo = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      fila.push(v);
      if (v < minimo) minimo = v;
    }
    if (minimo > maximo) return maximo + 1;
    previa = fila;
  }
  return previa[b.length];
}
