import { slug } from './nota.ts';
import { RELACIONES, type Arista, type Grafo, type Nota } from './tipos.ts';

export function idHub(tipo: string): string {
  return `hub:${tipo}`;
}

export function resolverEnlace(notas: Map<string, Nota>, indice: Map<string, string>, destino: string): string | undefined {
  if (notas.has(destino)) return destino;
  return indice.get(slug(destino));
}

export function indiceDeNotas(notas: Map<string, Nota>): Map<string, string> {
  const indice = new Map<string, string>();
  // el alias cede ante un título o un id con el mismo nombre
  for (const nota of notas.values()) for (const a of nota.alias ?? []) if (slug(a)) indice.set(slug(a), nota.id);
  for (const nota of notas.values()) indice.set(slug(nota.titulo), nota.id);
  for (const id of notas.keys()) indice.set(id, id);
  return indice;
}

/** `[[otro-cerebro:id]]` apunta a una nota de otro cerebro si ese cerebro existe */
export function enlaceExterno(destino: string, cerebros?: Set<string>): { cerebro: string; id: string } | undefined {
  const m = destino.match(/^([a-z0-9][a-z0-9-]{0,40}):(.+)$/);
  if (!m || !cerebros?.has(m[1])) return undefined;
  return { cerebro: m[1], id: m[2].trim() };
}

export function construirGrafo(notas: Map<string, Nota>, cerebros?: Set<string>): Grafo {
  const indice = indiceDeNotas(notas);
  const aristas: Arista[] = [];
  const entrantes = new Map<string, string[]>();
  const salientes = new Map<string, number>();
  const rotos = new Map<string, string[]>();
  const externos = new Map<string, string[]>();

  const unir = (origen: string, destino: string, relacion?: Arista['relacion']) => {
    aristas.push(relacion ? { origen, destino, clase: 'enlace', relacion } : { origen, destino, clase: 'enlace' });
    entrantes.set(destino, [...(entrantes.get(destino) ?? []), origen]);
    salientes.set(origen, (salientes.get(origen) ?? 0) + 1);
  };

  for (const nota of notas.values()) {
    const conRelacion = new Set<string>();
    for (const relacion of RELACIONES) {
      for (const enlace of nota.relaciones?.[relacion] ?? []) {
        const destino = resolverEnlace(notas, indice, enlace);
        if (!destino) {
          rotos.set(nota.id, [...(rotos.get(nota.id) ?? []), enlace]);
          continue;
        }
        if (destino === nota.id) continue;
        conRelacion.add(destino);
        unir(nota.id, destino, relacion);
      }
    }
    for (const enlace of nota.enlaces) {
      const destino = resolverEnlace(notas, indice, enlace);
      if (!destino) {
        if (enlaceExterno(enlace, cerebros)) externos.set(nota.id, [...(externos.get(nota.id) ?? []), enlace]);
        else rotos.set(nota.id, [...(rotos.get(nota.id) ?? []), enlace]);
        continue;
      }
      if (destino === nota.id || conRelacion.has(destino)) continue;
      unir(nota.id, destino);
    }
  }

  // Ninguna neurona queda suelta: sin conexiones, se cuelga del hub de su tipo
  for (const nota of notas.values()) {
    if (!salientes.get(nota.id) && !entrantes.get(nota.id)?.length) {
      aristas.push({ origen: nota.id, destino: idHub(nota.tipo), clase: 'hub' });
    }
  }

  return { notas, aristas, entrantes, rotos, externos };
}

export function salientesDe(grafo: Grafo, id: string): string[] {
  return grafo.aristas.filter((a) => a.origen === id && a.clase === 'enlace').map((a) => a.destino);
}

/** Notas a N saltos de una, con la distancia a la que quedan */
export function vecindario(grafo: Grafo, id: string, saltos: number): Map<string, number> {
  const distancia = new Map<string, number>([[id, 0]]);
  let frontera = [id];
  for (let d = 1; d <= saltos && frontera.length; d++) {
    const siguiente: string[] = [];
    for (const actual of frontera) {
      const cercanas = [
        ...grafo.aristas.filter((a) => a.clase === 'enlace' && a.origen === actual).map((a) => a.destino),
        ...(grafo.entrantes.get(actual) ?? []),
      ];
      for (const v of cercanas) {
        if (distancia.has(v)) continue;
        distancia.set(v, d);
        siguiente.push(v);
      }
    }
    frontera = siguiente;
  }
  distancia.delete(id);
  return distancia;
}
