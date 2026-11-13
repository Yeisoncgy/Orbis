import { slug } from './nota.ts';
import type { Arista, Grafo, Nota } from './tipos.ts';

export function idHub(tipo: string): string {
  return `hub:${tipo}`;
}

export function resolverEnlace(notas: Map<string, Nota>, indice: Map<string, string>, destino: string): string | undefined {
  if (notas.has(destino)) return destino;
  return indice.get(slug(destino));
}

export function indiceDeNotas(notas: Map<string, Nota>): Map<string, string> {
  const indice = new Map<string, string>();
  for (const nota of notas.values()) indice.set(slug(nota.titulo), nota.id);
  for (const id of notas.keys()) indice.set(id, id);
  return indice;
}

export function construirGrafo(notas: Map<string, Nota>): Grafo {
  const indice = indiceDeNotas(notas);
  const aristas: Arista[] = [];
  const entrantes = new Map<string, string[]>();
  const salientes = new Map<string, number>();
  const rotos = new Map<string, string[]>();

  for (const nota of notas.values()) {
    for (const enlace of nota.enlaces) {
      const destino = resolverEnlace(notas, indice, enlace);
      if (!destino) {
        rotos.set(nota.id, [...(rotos.get(nota.id) ?? []), enlace]);
        continue;
      }
      if (destino === nota.id) continue;
      aristas.push({ origen: nota.id, destino, clase: 'enlace' });
      entrantes.set(destino, [...(entrantes.get(destino) ?? []), nota.id]);
      salientes.set(nota.id, (salientes.get(nota.id) ?? 0) + 1);
    }
  }

  // Ninguna neurona queda suelta: sin conexiones, se cuelga del hub de su tipo
  for (const nota of notas.values()) {
    if (!salientes.get(nota.id) && !entrantes.get(nota.id)?.length) {
      aristas.push({ origen: nota.id, destino: idHub(nota.tipo), clase: 'hub' });
    }
  }

  return { notas, aristas, entrantes, rotos };
}

export function salientesDe(grafo: Grafo, id: string): string[] {
  return grafo.aristas.filter((a) => a.origen === id && a.clase === 'enlace').map((a) => a.destino);
}
