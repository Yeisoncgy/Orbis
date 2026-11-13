// Lo que el CLI exige o advierte al guardar una nota. Una memoria vale por lo que deja fuera.
import { tokensDe } from './nota.ts';

export const DESCRIPCION_RECOMENDADA = 140;
export const DESCRIPCION_MAXIMA = 200;
export const CONTENIDO_MINIMO = 30;
export const NOTA_LARGA_TOKENS = 1500;

const SECRETOS: [RegExp, string][] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'una clave privada'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/, 'un token JWT'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'una clave de API'],
  [/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/, 'una clave de API'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'un token de GitHub'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/, 'un token de GitHub'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'un token de Slack'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'una clave de AWS'],
  [/\bsb[ps]_[A-Za-z0-9]{20,}/, 'una clave de Supabase'],
  [/\bre_[A-Za-z0-9]{20,}/, 'una clave de Resend'],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/<>]{2,}:[^\s:@/<>]{4,}@[^\s]+/i, 'una dirección con usuario y contraseña'],
];

const ASIGNACION = /(?:contrase(?:ñ|n)a|password|passwd|clave|secreto?|token|api[_-]?key)\s*[:=]\s*["'`]?([^\s"'`<>]{8,})/i;
const DE_EJEMPLO = /^(?:x{3,}|\*{3,}|\.{3,}|ejemplo|example|tu[_-]|your[_-]|changeme|cambiar|secreto|password|\$\{|\$[A-Z_]+|process\.env)/i;

/**
 * Líneas que parecen llevar un secreto. Nunca devuelve el secreto: solo dónde está y qué parece.
 * Va antes de escribir: lo que entra a una nota queda en el historial de git.
 */
export function buscarSecretos(texto: string): string[] {
  const hallazgos: string[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    for (const [patron, nombre] of SECRETOS) {
      if (patron.test(linea)) {
        hallazgos.push(`línea ${i + 1}: parece ${nombre}`);
        return;
      }
    }
    const m = linea.match(ASIGNACION);
    if (m && /[A-Za-z]/.test(m[1]) && /\d/.test(m[1]) && !DE_EJEMPLO.test(m[1])) {
      hallazgos.push(`línea ${i + 1}: parece una contraseña o un token escrito tal cual`);
    }
  });
  return hallazgos;
}

/** Una nota que es casi toda código o rutas repite lo que el repositorio ya dice */
export function pareceCodigo(contenido: string): boolean {
  const lineas = contenido.split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 8) return false;
  let enBloque = false;
  let deCodigo = 0;
  for (const l of lineas) {
    if (/^\s*```/.test(l)) {
      enBloque = !enBloque;
      deCodigo++;
      continue;
    }
    if (enBloque || /^\s*[-*]?\s*`?[\w./-]+\.(?:ts|tsx|js|mjs|py|sql|json|md|css|html|yml|yaml)`?\s*$/.test(l)) deCodigo++;
  }
  return deCodigo / lineas.length > 0.6;
}

/** Avisos que no impiden guardar, pero que el agente debe leer */
export function avisosDeForma(descripcion: string, contenido: string): string[] {
  const avisos: string[] = [];
  if (descripcion.length > DESCRIPCION_RECOMENDADA) {
    avisos.push(
      `La descripción tiene ${descripcion.length} caracteres: es lo que se paga en el mapa. Déjala en ${DESCRIPCION_RECOMENDADA} o menos.`,
    );
  }
  const tokens = tokensDe(contenido);
  if (tokens > NOTA_LARGA_TOKENS) {
    avisos.push(`Nota larga (~${tokens} tokens): si trata más de una idea, pártela en notas enlazadas.`);
  }
  if (pareceCodigo(contenido)) {
    avisos.push('Es casi toda código o rutas: guarda el porqué y lo que no se ve en el repositorio, no lo que el código ya dice.');
  }
  return avisos;
}
