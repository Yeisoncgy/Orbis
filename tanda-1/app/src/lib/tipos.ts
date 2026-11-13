import type { Tipo } from '../../../core/src/tipos.ts';

export const ORDEN_TIPOS: Tipo[] = ['contexto', 'decision', 'convencion', 'modulo', 'estado', 'glosario', 'persona'];

export const ETIQUETA_TIPO: Record<Tipo, string> = {
  contexto: 'Contexto',
  decision: 'Decisiones',
  convencion: 'Convenciones',
  modulo: 'Módulos',
  estado: 'Estado',
  glosario: 'Glosario',
  persona: 'Personas',
};

export const SINGULAR_TIPO: Record<Tipo, string> = {
  contexto: 'Contexto',
  decision: 'Decisión',
  convencion: 'Convención',
  modulo: 'Módulo',
  estado: 'Estado',
  glosario: 'Glosario',
  persona: 'Persona',
};

// Paleta viva sobre papel: el rojo de marca para decisiones y tonos saturados que se separan bien entre sí
export const COLOR_TIPO: Record<Tipo, string> = {
  contexto: '#3D5AFE',
  decision: '#C81E1E',
  convencion: '#0EA5E9',
  modulo: '#10B981',
  estado: '#F59E0B',
  glosario: '#8B5CF6',
  persona: '#EC4899',
};

export const ETIQUETA_ACCION: Record<string, string> = {
  mapa: 'Consultó el mapa',
  leer: 'Leyó',
  buscar: 'Buscó',
  escribir: 'Escribió',
  estado: 'Cambió el estado de',
};
