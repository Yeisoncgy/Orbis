import { parse, stringify } from 'yaml';
import { ESTADOS, RELACIONES, TIPOS, type Estado, type Nota, type Relacion, type Tipo } from './tipos.ts';

export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function slug(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

// [[destino]], [[destino|alias]], [[destino#seccion]]
export function extraerEnlaces(contenido: string): string[] {
  const vistos = new Set<string>();
  for (const m of contenido.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const destino = m[1].split('|')[0].split('#')[0].trim();
    if (destino) vistos.add(destino);
  }
  return [...vistos];
}

export class ErrorNota extends Error {}

function lista(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.map((v) => String(v).trim()).filter(Boolean);
  if (valor === undefined || valor === null || valor === '') return [];
  return [String(valor).trim()];
}

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  // YAML puede entregar una fecha como Date según cómo venga escrita
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor);
}

export function relacionesDe(fm: Record<string, unknown>): Partial<Record<Relacion, string[]>> | undefined {
  const rel: Partial<Record<Relacion, string[]>> = {};
  for (const r of RELACIONES) {
    const ids = lista(fm[r]);
    if (ids.length) rel[r] = ids;
  }
  return Object.keys(rel).length ? rel : undefined;
}

export function leerNota(id: string, crudo: string): Nota {
  const m = crudo.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new ErrorNota(`${id}: falta el frontmatter`);
  const fm = (parse(m[1]) ?? {}) as Record<string, unknown>;
  const contenido = m[2].trim();

  const tipo = String(fm.tipo ?? '') as Tipo;
  if (!TIPOS.includes(tipo)) throw new ErrorNota(`${id}: tipo "${fm.tipo}" no válido`);
  const estado = (ESTADOS.includes(fm.estado as Estado) ? fm.estado : 'consolidada') as Estado;
  const alias = lista(fm.alias);
  const fuente = lista(fm.fuente);

  return {
    id,
    titulo: String(fm.titulo ?? id),
    tipo,
    descripcion: String(fm.descripcion ?? ''),
    estado,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    creado: texto(fm.creado) ?? '',
    actualizado: texto(fm.actualizado) ?? texto(fm.creado) ?? '',
    fusionadaEn: fm.fusionada_en ? String(fm.fusionada_en) : undefined,
    contenido,
    enlaces: extraerEnlaces(contenido),
    alias: alias.length ? alias : undefined,
    fuente: fuente.length ? fuente : undefined,
    verificado: texto(fm.verificado),
    validoDesde: texto(fm.valido_desde),
    validoHasta: texto(fm.valido_hasta),
    origen: texto(fm.origen),
    proyecto: texto(fm.proyecto),
    sesion: texto(fm.sesion),
    revisar: texto(fm.revisar),
    relaciones: relacionesDe(fm),
  };
}

export function escribirNota(nota: Nota): string {
  const fm: Record<string, unknown> = {
    titulo: nota.titulo,
    tipo: nota.tipo,
    descripcion: nota.descripcion,
    estado: nota.estado,
    tags: nota.tags,
    creado: nota.creado,
    actualizado: nota.actualizado,
  };
  if (nota.fusionadaEn) fm.fusionada_en = nota.fusionadaEn;
  if (nota.alias?.length) fm.alias = nota.alias;
  if (nota.fuente?.length) fm.fuente = nota.fuente;
  if (nota.verificado) fm.verificado = nota.verificado;
  if (nota.validoDesde) fm.valido_desde = nota.validoDesde;
  if (nota.validoHasta) fm.valido_hasta = nota.validoHasta;
  for (const r of RELACIONES) if (nota.relaciones?.[r]?.length) fm[r] = nota.relaciones[r];
  if (nota.origen) fm.origen = nota.origen;
  if (nota.proyecto) fm.proyecto = nota.proyecto;
  if (nota.sesion) fm.sesion = nota.sesion;
  if (nota.revisar) fm.revisar = nota.revisar;
  return `---\n${stringify(fm, { lineWidth: 0 }).trimEnd()}\n---\n\n${nota.contenido.trim()}\n`;
}

/** ¿ya pasó su fecha de validez? */
export function vencida(nota: Nota, fecha = hoy()): boolean {
  return !!nota.validoHasta && nota.validoHasta < fecha;
}

/** tokens aproximados de un texto (la misma cuenta que usa el mapa) */
export function tokensDe(textoPlano: string): number {
  return Math.round(textoPlano.length / 3.5);
}
