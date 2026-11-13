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
}
