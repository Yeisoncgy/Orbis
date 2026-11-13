export const TIPOS = ['contexto', 'decision', 'convencion', 'modulo', 'estado', 'glosario', 'persona'] as const;
export type Tipo = (typeof TIPOS)[number];

export const NOMBRE_TIPO: Record<Tipo, string> = {
  contexto: 'Contexto',
  decision: 'Decisiones',
  convencion: 'Convenciones',
  modulo: 'Módulos',
  estado: 'Estado',
  glosario: 'Glosario',
  persona: 'Personas',
};

// reciente = memoria de corto plazo, pendiente de consolidar
export const ESTADOS = ['reciente', 'consolidada', 'obsoleta'] as const;
export type Estado = (typeof ESTADOS)[number];

export type Accion = 'mapa' | 'leer' | 'buscar' | 'escribir' | 'estado';

export interface MetaCerebro {
  nombre: string;
  descripcion: string;
  personal: boolean;
  creado: string;
}

export interface Nota {
  id: string;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  estado: Estado;
  tags: string[];
  creado: string;
  actualizado: string;
  fusionadaEn?: string;
  contenido: string;
  enlaces: string[];
}

export interface Arista {
  origen: string;
  destino: string;
  // hub = enlace automático de una nota sin conexiones al nodo central de su tipo
  clase: 'enlace' | 'hub';
}

export interface Uso {
  lecturas: number;
  ultimaLectura?: string;
}

export interface Grafo {
  notas: Map<string, Nota>;
  aristas: Arista[];
  entrantes: Map<string, string[]>;
  rotos: Map<string, string[]>;
}
