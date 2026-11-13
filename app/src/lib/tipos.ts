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

// Luz de agua profunda: siete tonos que se separan entre sí sobre azul casi negro
export const COLOR_TIPO: Record<Tipo, string> = {
  contexto: '#5AB0FF',
  decision: '#FF9E6B',
  convencion: '#7CFFE1',
  modulo: '#FFE27A',
  estado: '#8CFF9E',
  glosario: '#C3B8FF',
  persona: '#FF9DB5',
};
