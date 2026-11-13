// Contrato entre el servidor local y la app visual (solo tipos)
import type { Accion, Estado, MetaCerebro, Tipo } from '../core/src/tipos.ts';

export interface CerebroApi extends MetaCerebro {
  notas: number;
  recientes: number;
}

export interface NodoApi {
  id: string;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  estado: Estado;
  tags: string[];
  creado: string;
  actualizado: string;
  fusionadaEn?: string;
  lecturas: number;
  ultimaLectura?: string;
  /** primera etiqueta: el tema dentro de su tipo */
  tema?: string;
  /** motivo por el que hay que revisarla (cita algo que ya no existe) */
  revisar?: string;
  vencida?: boolean;
}

export interface AristaApi {
  origen: string;
  destino: string;
  clase: 'enlace' | 'hub';
}

export interface GrafoApi {
  meta: MetaCerebro;
  nodos: NodoApi[];
  aristas: AristaApi[];
  rotos: number;
  errores: string[];
}

export interface VecinoApi {
  id: string;
  titulo: string;
  tipo: Tipo;
}

export interface NotaApi extends NodoApi {
  contenido: string;
  salientes: VecinoApi[];
  entrantes: VecinoApi[];
  // [[enlace]] tal como está escrito → id resuelto (para volver clicables los enlaces del texto)
  enlaces: Record<string, string>;
  alias?: string[];
  fuente?: string[];
  verificado?: string;
  validoHasta?: string;
  origen?: string;
}

export interface ResultadoApi {
  id: string;
  titulo: string;
  tipo: Tipo;
  descripcion: string;
  fragmento: string;
}

export interface EventoApi {
  cerebro: string;
  ts: string;
  accion: Accion;
  notas: string[];
  pid: number;
  /** sesión de Claude Code y proyecto desde donde se llamó */
  sesion?: string;
  proyecto?: string;
  consulta?: string;
  tokens?: number;
}

/** Una nota sin revisar, junto a las consolidadas que más se le parecen */
export interface RevisionApi extends VecinoApi {
  descripcion: string;
  origen?: string;
  actualizado: string;
  parecidas: (VecinoApi & { cuanto: number })[];
}

/** Signos vitales de un cerebro: cuánto cuesta, cuánto se usa y qué le falta */
export interface SaludApi {
  mapaTokens: number;
  presupuesto: number;
  vivas: number;
  consolidadas: number;
  recientes: number;
  porComprobar: number;
  leidas: number;
  retiradas: number;
  /** lo que los agentes buscaron y no encontraron, de lo más reciente a lo más viejo */
  sinResultado: { consulta: string; ts: string }[];
}
