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

// Enlaces con significado. Van en el frontmatter (reemplaza: [id], depende_de: [id], contradice: [id]).
export const RELACIONES = ['reemplaza', 'depende_de', 'contradice'] as const;
export type Relacion = (typeof RELACIONES)[number];

export const NOMBRE_RELACION: Record<Relacion, string> = {
  reemplaza: 'Reemplaza a',
  depende_de: 'Depende de',
  contradice: 'Contradice a',
};

export type Accion = 'mapa' | 'leer' | 'buscar' | 'escribir' | 'estado';

export interface MetaCerebro {
  nombre: string;
  descripcion: string;
  personal: boolean;
  creado: string;
  /** tope del mapa raíz en tokens; por encima, el mapa se parte en temas */
  presupuestoMapa?: number;
  /** carpeta del proyecto que documenta: contra ella se comprueban las rutas que citan las notas */
  repo?: string;
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
  /** otros nombres con los que alguien la buscaría */
  alias?: string[];
  /** de dónde sale lo que dice: archivo, commit o conversación */
  fuente?: string[];
  /** última vez que alguien confirmó que sigue siendo cierta */
  verificado?: string;
  validoDesde?: string;
  validoHasta?: string;
  /** quién la escribió: agente, persona o importacion */
  origen?: string;
  proyecto?: string;
  sesion?: string;
  /** motivo por el que hay que revisarla antes de fiarse (lo pone `comprobar`) */
  revisar?: string;
  relaciones?: Partial<Record<Relacion, string[]>>;
}

export interface Arista {
  origen: string;
  destino: string;
  // hub = enlace automático de una nota sin conexiones al nodo central de su tipo
  clase: 'enlace' | 'hub';
  relacion?: Relacion;
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
  /** enlaces a notas de otros cerebros, tal como se escribieron: [[cerebro:id]] */
  externos: Map<string, string[]>;
}
